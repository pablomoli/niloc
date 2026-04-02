"""
Build a reusable VIO noise segment library from real indoor localization recordings.

Each segment is a window of (noise_x, noise_y) offsets normalized to start
at (0, 0), extracted by sliding a fixed-length window over each train-split
trajectory with a fixed stride.

Coordinate convention
---------------------
In universityA .txt files: gt_x = row index, gt_y = col index.
Noise is extracted as (x - gt_x, y - gt_y) — a relative offset that is
independent of the row/col axis convention. Scaling to a target floorplan
DPI happens at injection time (issue #6), not here.

For HDF5 sources (universityB, officeC), coordinates are in metres. The
``dpi`` parameter converts them to pixels so that noise magnitudes are
comparable across sources. Noise is extracted as
``(ronin_aligned - aligned_pos) * dpi`` after aligning the RoNIN starting
position to the ground-truth starting position.

Noise values can be negative: VIO loop closure and recalibration events pull
the estimated position back past ground truth. Segments are stored as-is;
no sign correction is applied.

Output
------
preprocess/data/noise_library.npy      shape (N, window_size, 2)
preprocess/data/noise_library_meta.json  per-segment provenance + statistics
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import h5py
import matplotlib
import matplotlib.pyplot as plt
import numpy as np

matplotlib.use('Agg')

# ---------------------------------------------------------------------------
# Defaults (match A* min_length and issue #3 spec)
# ---------------------------------------------------------------------------
DEFAULT_WINDOW   = 400   # frames — matches synthetic_data.yaml min_length
DEFAULT_STRIDE   = 50    # frames — maximizes segment count without heavy overlap
OUTLIER_FACTOR   = 3.0   # segments where max|drift| > factor * p95 are discarded
SOURCE_DPI       = 2.5   # px/m for universityA

TS, X, Y, GTX, GTY = 0, 1, 2, 3, 4


def load_train_trajectories(data_dir: Path) -> dict[str, np.ndarray]:
    """Load .txt files that appear in train.txt, excluding val/test."""
    train = set((data_dir / 'train.txt').read_text().splitlines())
    excluded = (
        set((data_dir / 'val.txt').read_text().splitlines()) |
        set((data_dir / 'test.txt').read_text().splitlines())
    )
    trajs = {}
    for txt in sorted(data_dir.glob('*.txt')):
        name = txt.stem
        if name in ('train', 'val', 'test') or name in excluded:
            continue
        if name not in train:
            continue
        trajs[name] = np.loadtxt(txt, comments='#')
    return trajs


def load_train_trajectories_hdf5(data_dir: Path, dpi: float) -> dict[str, np.ndarray]:
    """Load trajectory HDF5 files listed in train.txt.

    Only ``_t.hdf5`` (trajectory) files are read; ``_i.hdf5`` (IMU-only)
    entries are ignored.  Each file is converted to the same ``(T, 5)`` array
    layout as the universityA ``.txt`` files: ``[ts, x, y, gt_x, gt_y]``.

    The RoNIN column (``computed/ronin``) represents the VIO estimate in
    metres.  Its starting position is aligned to the ground-truth starting
    position before scaling to pixels (same alignment used by
    ``preprocess/real_data/distance_sample.py``).

    Parameters
    ----------
    data_dir:
        Directory containing the ``_t.hdf5`` files and ``train.txt``.
    dpi:
        Pixels per metre for this dataset (used to scale metres to pixels so
        noise magnitudes match the universityA convention).

    Returns
    -------
    dict mapping trajectory name to ``(T, 5)`` float64 array.
    """
    train_entries = set((data_dir / 'train.txt').read_text().splitlines())
    # Keep only _t entries that have a corresponding file on disk.
    train_t = {e for e in train_entries if e.endswith('_t')}

    trajs: dict[str, np.ndarray] = {}
    for name in sorted(train_t):
        hdf5_path = data_dir / f'{name}.hdf5'
        if not hdf5_path.exists():
            print(f'  warning: {hdf5_path} not found, skipping')
            continue
        with h5py.File(hdf5_path, 'r') as f:
            ts     = np.array(f['synced/time'])          # (T,)
            ronin  = np.array(f['computed/ronin'])       # (T, 2) metres
            gt     = np.array(f['computed/aligned_pos']) # (T, 2) metres

        # Align RoNIN to start at the same position as ground truth.
        ronin = ronin + (gt[0] - ronin[0])

        # Scale from metres to pixels.
        x_px   = ronin[:, 0] * dpi
        y_px   = ronin[:, 1] * dpi
        gtx_px = gt[:, 0] * dpi
        gty_px = gt[:, 1] * dpi

        trajs[name] = np.stack([ts, x_px, y_px, gtx_px, gty_px], axis=1)

    return trajs


def extract_segments(
    trajs: dict[str, np.ndarray],
    window: int,
    stride: int,
) -> tuple[np.ndarray, list[dict]]:
    """
    Slide a window over each trajectory's noise signal and extract segments.

    Each segment is normalized so noise[0] == (0, 0) — position-agnostic
    injection onto any floorplan.

    Returns
    -------
    segments : (N, window, 2) float32
    meta     : list of N dicts with provenance and per-segment statistics
    """
    segments = []
    meta = []

    for name, traj in trajs.items():
        n = len(traj)
        if n < window:
            print(f'  skip {name}: only {n} frames (< window {window})')
            continue

        noise_x = traj[:, X] - traj[:, GTX]
        noise_y = traj[:, Y] - traj[:, GTY]

        for start in range(0, n - window + 1, stride):
            end = start + window
            nx = noise_x[start:end] - noise_x[start]   # normalize to (0,0)
            ny = noise_y[start:end] - noise_y[start]
            mag = np.sqrt(nx**2 + ny**2)

            segments.append(np.stack([nx, ny], axis=-1).astype(np.float32))
            meta.append({
                'source':      name,
                'frame_start': int(start),
                'frame_end':   int(end),
                'mean_drift':  float(mag.mean()),
                'max_drift':   float(mag.max()),
                'final_drift': float(mag[-1]),
            })

    return np.array(segments, dtype=np.float32), meta


def filter_outliers(
    segments: np.ndarray,
    meta: list[dict],
    factor: float,
) -> tuple[np.ndarray, list[dict]]:
    """Discard segments whose max drift exceeds factor * p95(max_drift)."""
    max_drifts = np.array([m['max_drift'] for m in meta])
    p95 = np.percentile(max_drifts, 95)
    threshold = factor * p95
    keep = max_drifts <= threshold
    n_removed = int((~keep).sum())
    print(f'  outlier threshold ({factor}x p95={p95:.1f}): {threshold:.1f} px')
    print(f'  removed {n_removed} outlier segments, keeping {keep.sum()}')
    return segments[keep], [m for m, k in zip(meta, keep) if k]


def save_library(
    segments: np.ndarray,
    meta: list[dict],
    out_dir: Path,
    window: int,
    stride: int,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    npy_path  = out_dir / 'noise_library.npy'
    json_path = out_dir / 'noise_library_meta.json'

    np.save(npy_path, segments)

    all_drifts = np.array([m['mean_drift'] for m in meta])
    summary = {
        'n_segments':    len(segments),
        'window_size':   window,
        'stride':        stride,
        'source_dpi':    SOURCE_DPI,
        'shape':         list(segments.shape),
        'mean_drift_px': float(all_drifts.mean()),
        'median_drift_px': float(np.median(all_drifts)),
        'p95_drift_px':  float(np.percentile(all_drifts, 95)),
        'max_drift_px':  float(all_drifts.max()),
        'segments':      meta,
    }
    json_path.write_text(json.dumps(summary, indent=2))
    print(f'  saved {npy_path}  shape={segments.shape}')
    print(f'  saved {json_path}')


def plot_gallery(segments: np.ndarray, out_path: Path, n: int = 20) -> None:
    """Plot n sample segment drift curves and save to disk."""
    rng = np.random.default_rng(42)
    idx = rng.choice(len(segments), size=min(n, len(segments)), replace=False)
    sample = segments[idx]

    fig, axes = plt.subplots(2, 1, figsize=(14, 7))

    ax = axes[0]
    for seg in sample:
        mag = np.sqrt(seg[:, 0]**2 + seg[:, 1]**2)
        ax.plot(mag, alpha=0.6, linewidth=0.8)
    ax.set_xlabel('Frame index within segment')
    ax.set_ylabel('|drift| (px)')
    ax.set_title(f'Noise magnitude — {len(sample)} random segments from library')

    ax2 = axes[1]
    for seg in sample:
        ax2.plot(seg[:, 0], seg[:, 1], alpha=0.5, linewidth=0.7)
    ax2.scatter([0], [0], color='red', zorder=5, s=20, label='start (0,0)')
    ax2.set_xlabel('noise_x (px)')
    ax2.set_ylabel('noise_y (px)')
    ax2.set_title('2-D drift paths (normalized to origin)')
    ax2.legend()
    ax2.set_aspect('equal')

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f'  saved gallery {out_path}')
    plt.close(fig)


def _parse_extra_source(spec: str) -> tuple[Path, float]:
    """Parse a ``data_dir:dpi`` extra-source specification.

    Parameters
    ----------
    spec:
        String of the form ``<path>:<dpi>``, e.g. ``data/universityB:2.5``.

    Returns
    -------
    Tuple of ``(Path, float)``.

    Raises
    ------
    argparse.ArgumentTypeError
        If the format is invalid or ``dpi`` cannot be parsed as a float.
    """
    parts = spec.rsplit(':', 1)
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(
            f'Extra source must be formatted as <path>:<dpi>, got: {spec!r}'
        )
    try:
        dpi = float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f'DPI value in {spec!r} is not a valid float: {parts[1]!r}'
        ) from exc
    return Path(parts[0]), dpi


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description='Build VIO noise segment library.')
    parser.add_argument('--data-dir',  type=Path,
                        default=Path('data/universityA'),
                        help='Directory with universityA .txt files and split lists.')
    parser.add_argument('--out-dir',   type=Path,
                        default=Path('preprocess/data'),
                        help='Output directory for noise_library.npy and metadata.')
    parser.add_argument('--window',    type=int, default=DEFAULT_WINDOW,
                        help='Segment window length in frames.')
    parser.add_argument('--stride',    type=int, default=DEFAULT_STRIDE,
                        help='Sliding window stride in frames.')
    parser.add_argument('--plot',      action='store_true',
                        help='Save a visual gallery of sample segments.')
    parser.add_argument(
        '--extra-sources',
        nargs='+',
        metavar='DATA_DIR:DPI',
        default=[],
        help=(
            'Additional HDF5 data sources to include, each specified as '
            '<path>:<dpi>.  Example: data/universityB:2.5 data/officeC:10.0'
        ),
    )
    args = parser.parse_args(argv)

    print(f'Loading trajectories from {args.data_dir} ...')
    trajs = load_train_trajectories(args.data_dir)
    print(f'  {len(trajs)} train trajectories loaded')

    for spec in args.extra_sources:
        extra_dir, extra_dpi = _parse_extra_source(spec)
        print(f'Loading HDF5 trajectories from {extra_dir} (dpi={extra_dpi}) ...')
        extra_trajs = load_train_trajectories_hdf5(extra_dir, extra_dpi)
        print(f'  {len(extra_trajs)} train trajectories loaded')
        # Prefix names with the directory name to avoid collisions.
        prefix = extra_dir.name
        trajs.update({f'{prefix}/{k}': v for k, v in extra_trajs.items()})

    print(f'Total trajectories: {len(trajs)}')

    print(f'Extracting segments (window={args.window}, stride={args.stride}) ...')
    segments, meta = extract_segments(trajs, args.window, args.stride)
    print(f'  {len(segments)} raw segments')

    if len(segments) == 0:
        print('ERROR: no segments extracted — check data directory and window size.')
        sys.exit(1)

    print('Filtering outlier segments ...')
    segments, meta = filter_outliers(segments, meta, OUTLIER_FACTOR)

    if len(segments) < 500:
        print(f'WARNING: only {len(segments)} segments — below 500-segment target.')

    print('Saving library ...')
    save_library(segments, meta, args.out_dir, args.window, args.stride)

    if args.plot:
        print('Generating gallery ...')
        plot_gallery(segments, args.out_dir / 'noise_library_gallery.png')

    print(f'\nDone. {len(segments)} segments, window={args.window}, stride={args.stride}')
    print(f'Mean drift: {np.mean([m["mean_drift"] for m in meta]):.1f} px')


if __name__ == '__main__':
    main()
