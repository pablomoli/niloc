"""
Build a reusable VIO noise segment library from real indoor localization recordings.

Each segment is a window of (noise_x, noise_y) offsets normalized to start
at (0, 0), extracted by sliding a fixed-length window over each train-split
trajectory with a fixed stride.

All noise is stored in **metres** regardless of the source DPI or sampling
rate. This makes the library DPI-agnostic: injection simply multiplies by the
target floorplan's DPI. A ``--target-freq`` argument resamples all sources to
a common frequency before windowing so that every library segment represents
the same real-world duration.

Coordinate convention
---------------------
In universityA .txt files: gt_x = row index, gt_y = col index.
Noise is (x - gt_x, y - gt_y) in pixels; divided by ``source_dpi`` to
convert to metres before storage.

For HDF5 sources (universityB, officeC), ``computed/ronin`` and
``computed/aligned_pos`` are already in metres. Noise is extracted directly
as (ronin_aligned - aligned_pos), with no DPI conversion required.

Noise values can be negative: VIO loop closure and recalibration events pull
the estimated position back past ground truth. Segments are stored as-is;
no sign correction is applied.

Output
------
preprocess/data/noise_library.npy      shape (N, window_size, 2)  units: metres
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
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_WINDOW   = 150   # frames at target_freq — 150 s at 1 Hz covers typical paths
DEFAULT_STRIDE   = 50    # frames — maximizes segment count without heavy overlap
OUTLIER_FACTOR   = 3.0   # segments where max|drift| > factor * p95 are discarded

TS, X, Y, GTX, GTY = 0, 1, 2, 3, 4


def _resample(arr: np.ndarray, ts_col: np.ndarray, target_freq: float) -> np.ndarray:
    """Downsample ``arr`` from its native rate to ``target_freq`` Hz.

    Parameters
    ----------
    arr        : (T, ...) array to downsample
    ts_col     : (T,) timestamps in seconds
    target_freq: desired output frequency in Hz

    Returns
    -------
    (T', ...) downsampled array where T' = T / step
    """
    if len(ts_col) < 2:
        return arr
    source_freq = (len(ts_col) - 1) / (ts_col[-1] - ts_col[0])
    step = max(1, round(source_freq / target_freq))
    return arr[::step]


def load_train_trajectories(
    data_dir: Path,
    source_dpi: float,
    target_freq: float,
) -> dict[str, np.ndarray]:
    """Load .txt files from train.txt, resample to target_freq, convert noise to metres.

    Parameters
    ----------
    data_dir   : directory containing .txt trajectories and split lists
    source_dpi : pixels per metre for this dataset (used to convert noise to metres)
    target_freq: desired output frequency in Hz
    """
    split_files = ('train.txt', 'val.txt', 'test.txt')
    train_path = data_dir / 'train.txt'
    if train_path.exists():
        train = set(train_path.read_text().splitlines())
        excluded = set()
        for name in ('val.txt', 'test.txt'):
            p = data_dir / name
            if p.exists():
                excluded |= set(p.read_text().splitlines())
    else:
        # No split files — use all .txt files in the directory.
        train = None
        excluded = set()

    trajs = {}
    for txt in sorted(data_dir.glob('*.txt')):
        name = txt.stem
        if name in split_files or name in excluded:
            continue
        if train is not None and name not in train:
            continue
        arr = np.loadtxt(txt, comments='#')
        arr = _resample(arr, arr[:, TS], target_freq)
        # Convert pixel columns to metres so noise is DPI-agnostic.
        arr = arr.copy()
        arr[:, X]   /= source_dpi
        arr[:, Y]   /= source_dpi
        arr[:, GTX] /= source_dpi
        arr[:, GTY] /= source_dpi
        trajs[name] = arr
    return trajs


def load_train_trajectories_hdf5(
    data_dir: Path,
    target_freq: float,
) -> dict[str, np.ndarray]:
    """Load trajectory HDF5 files listed in train.txt, resampled to target_freq.

    Only ``_t.hdf5`` (trajectory) files are read; ``_i.hdf5`` (IMU-only)
    entries are ignored.  Noise is returned in **metres** — no DPI conversion
    is applied since ``computed/ronin`` and ``computed/aligned_pos`` are
    already in metres.

    Parameters
    ----------
    data_dir   : directory containing ``_t.hdf5`` files and ``train.txt``
    target_freq: desired output frequency in Hz

    Returns
    -------
    dict mapping trajectory name to ``(T, 5)`` float64 array
    ``[ts, x_m, y_m, gt_x_m, gt_y_m]`` at target_freq.
    """
    train_path = data_dir / 'train.txt'
    if train_path.exists():
        train_t = {e for e in train_path.read_text().splitlines() if e.endswith('_t')}
    else:
        # No split file — use all _t.hdf5 files in the directory.
        train_t = {p.stem for p in data_dir.glob('*_t.hdf5')}

    trajs: dict[str, np.ndarray] = {}
    for name in sorted(train_t):
        hdf5_path = data_dir / f'{name}.hdf5'
        if not hdf5_path.exists():
            print(f'  warning: {hdf5_path} not found, skipping')
            continue
        with h5py.File(hdf5_path, 'r') as f:
            ts    = np.array(f['synced/time'])           # (T,) seconds
            ronin = np.array(f['computed/ronin'])        # (T, 2) metres
            gt    = np.array(f['computed/aligned_pos'])  # (T, 2) metres

        # Align RoNIN start to ground-truth start.
        ronin = ronin + (gt[0] - ronin[0])

        # Build (T, 5) array in metres, then resample.
        full = np.stack([ts, ronin[:, 0], ronin[:, 1], gt[:, 0], gt[:, 1]], axis=1)
        full = _resample(full, ts, target_freq)

        trajs[name] = full

    return trajs


TURN_THRESHOLD_DEG = 20.0          # max heading change in window → "turn"
STATIONARY_THRESHOLD_M_S = 0.3    # mean GT speed below this → "stationary"


def classify_segment_motion(
    traj: np.ndarray,
    start: int,
    end: int,
    target_freq: float = 1.0,
    turn_threshold_deg: float = TURN_THRESHOLD_DEG,
    stationary_threshold_m_s: float = STATIONARY_THRESHOLD_M_S,
) -> str:
    """
    Classify the GT motion type for trajectory window [start:end].

    Classification priority: stationary > turn > straight.

    Parameters
    ----------
    traj              : (T, 5) array in metres — columns [ts, x, y, gt_x, gt_y]
    start, end        : frame indices into traj
    target_freq       : sampling frequency in Hz (used to compute speed)
    turn_threshold_deg: maximum single-step heading change that still counts
                        as straight (degrees)
    stationary_threshold_m_s: mean GT speed below this is stationary

    Returns
    -------
    "stationary" | "turn" | "straight"
    """
    gt_x = traj[start:end, GTX]
    gt_y = traj[start:end, GTY]

    dx = np.diff(gt_x)
    dy = np.diff(gt_y)
    displacements = np.sqrt(dx**2 + dy**2)
    mean_speed = displacements.mean() * target_freq  # m/s

    if mean_speed < stationary_threshold_m_s:
        return "stationary"

    moving = displacements > 1e-6
    if not np.any(moving):
        return "stationary"

    headings = np.arctan2(dy[moving], dx[moving])
    if len(headings) < 2:
        return "straight"

    dh = np.abs(np.diff(headings))
    dh = np.minimum(dh, 2 * np.pi - dh)   # handle ±π wraparound

    # Use the 90th-percentile heading change to characterise the window.
    # Using the maximum causes almost all 150-frame windows to be classified
    # as "turn" because any long walk contains at least one sharp step.
    if np.degrees(np.percentile(dh, 90)) > turn_threshold_deg:
        return "turn"

    return "straight"


def extract_segments(
    trajs: dict[str, np.ndarray],
    window: int,
    stride: int,
    target_freq: float = 1.0,
) -> tuple[np.ndarray, list[dict]]:
    """
    Slide a window over each trajectory's noise signal and extract segments.

    Each segment is normalized so noise[0] == (0, 0) — position-agnostic
    injection onto any floorplan.

    Returns
    -------
    segments : (N, window, 2) float32
    meta     : list of N dicts with provenance, statistics, and motion_type
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
                'motion_type': classify_segment_motion(traj, start, end, target_freq),
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
    print(f'  outlier threshold ({factor}x p95={p95:.3f}): {threshold:.3f} m')
    print(f'  removed {n_removed} outlier segments, keeping {keep.sum()}')
    return segments[keep], [m for m, k in zip(meta, keep) if k]


def save_library(
    segments: np.ndarray,
    meta: list[dict],
    out_dir: Path,
    window: int,
    stride: int,
    target_freq: float,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    npy_path  = out_dir / 'noise_library.npy'
    json_path = out_dir / 'noise_library_meta.json'

    np.save(npy_path, segments)

    all_drifts = np.array([m['mean_drift'] for m in meta])

    # Per-bucket counts for the summary.
    bucket_counts: dict[str, int] = {}
    for m in meta:
        mt = m.get('motion_type', 'straight')
        bucket_counts[mt] = bucket_counts.get(mt, 0) + 1

    summary = {
        'n_segments':      len(segments),
        'window_size':     window,
        'stride':          stride,
        'units':           'metres',
        'target_freq_hz':  target_freq,
        'shape':           list(segments.shape),
        'mean_drift_m':    float(all_drifts.mean()),
        'median_drift_m':  float(np.median(all_drifts)),
        'p95_drift_m':     float(np.percentile(all_drifts, 95)),
        'max_drift_m':     float(all_drifts.max()),
        'motion_buckets':  bucket_counts,
        'segments':        meta,
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
    ax.set_ylabel('|drift| (m)')
    ax.set_title(f'Noise magnitude — {len(sample)} random segments from library')

    ax2 = axes[1]
    for seg in sample:
        ax2.plot(seg[:, 0], seg[:, 1], alpha=0.5, linewidth=0.7)
    ax2.scatter([0], [0], color='red', zorder=5, s=20, label='start (0,0)')
    ax2.set_xlabel('noise_x (m)')
    ax2.set_ylabel('noise_y (m)')
    ax2.set_title('2-D drift paths (normalized to origin)')
    ax2.legend()
    ax2.set_aspect('equal')

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f'  saved gallery {out_path}')
    plt.close(fig)


def plot_motion_buckets(
    segments: np.ndarray,
    meta: list[dict],
    out_path: Path,
    n_per_bucket: int = 30,
) -> None:
    """
    Plot drift magnitude curves per motion type to verify distinct profiles.

    Saves a figure with one subplot per bucket (straight / turn / stationary).
    """
    from collections import defaultdict

    rng = np.random.default_rng(42)
    buckets: dict[str, list[int]] = defaultdict(list)
    for i, m in enumerate(meta):
        buckets[m.get('motion_type', 'straight')].append(i)

    motion_types = ['straight', 'turn', 'stationary']
    present = [mt for mt in motion_types if mt in buckets]
    n_cols = len(present)

    fig, axes = plt.subplots(1, n_cols, figsize=(6 * n_cols, 4), sharey=True)
    if n_cols == 1:
        axes = [axes]

    for ax, mt in zip(axes, present):
        idx = np.array(buckets[mt])
        sample_idx = rng.choice(idx, size=min(n_per_bucket, len(idx)), replace=False)
        for i in sample_idx:
            mag = np.sqrt(segments[i, :, 0]**2 + segments[i, :, 1]**2)
            ax.plot(mag, alpha=0.5, linewidth=0.7, color={'straight': 'steelblue',
                                                           'turn': 'tomato',
                                                           'stationary': 'seagreen'}.get(mt))
        ax.set_title(f'{mt}  (n={len(idx)})')
        ax.set_xlabel('Frame within segment')
        ax.set_ylabel('|drift| (m)')

    fig.suptitle('Noise drift magnitude by motion type')
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f'  saved bucket plot {out_path}')
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
                        help='Directory with .txt trajectory files and split lists.')
    parser.add_argument('--source-dpi', type=float, default=2.5,
                        help='Pixels per metre of the primary .txt source (default: 2.5 for universityA).')
    parser.add_argument('--target-freq', type=float, default=1.0,
                        help='Resample all sources to this frequency in Hz before windowing (default: 1.0).')
    parser.add_argument('--out-dir',   type=Path,
                        default=Path('preprocess/data'),
                        help='Output directory for noise_library.npy and metadata.')
    parser.add_argument('--window',    type=int, default=DEFAULT_WINDOW,
                        help='Segment window length in frames at target-freq.')
    parser.add_argument('--stride',    type=int, default=DEFAULT_STRIDE,
                        help='Sliding window stride in frames.')
    parser.add_argument('--plot',      action='store_true',
                        help='Save a visual gallery of sample segments.')
    parser.add_argument(
        '--extra-sources',
        nargs='+',
        metavar='DATA_DIR',
        default=[],
        help=(
            'Additional HDF5 data sources to include (path only). '
            'Example: data/officeC data/universityB'
        ),
    )
    args = parser.parse_args(argv)

    print(f'Loading trajectories from {args.data_dir} (source_dpi={args.source_dpi}) ...')
    trajs = load_train_trajectories(args.data_dir, args.source_dpi, args.target_freq)
    print(f'  {len(trajs)} train trajectories loaded')

    for extra_dir_str in args.extra_sources:
        extra_dir = Path(extra_dir_str)
        print(f'Loading HDF5 trajectories from {extra_dir} ...')
        extra_trajs = load_train_trajectories_hdf5(extra_dir, args.target_freq)
        print(f'  {len(extra_trajs)} train trajectories loaded')
        prefix = extra_dir.name
        trajs.update({f'{prefix}/{k}': v for k, v in extra_trajs.items()})

    print(f'Total trajectories: {len(trajs)}')

    print(f'Extracting segments (window={args.window}, stride={args.stride}) ...')
    segments, meta = extract_segments(trajs, args.window, args.stride, args.target_freq)
    print(f'  {len(segments)} raw segments')

    if len(segments) == 0:
        print('ERROR: no segments extracted — check data directory and window size.')
        sys.exit(1)

    print('Filtering outlier segments ...')
    segments, meta = filter_outliers(segments, meta, OUTLIER_FACTOR)

    if len(segments) < 500:
        print(f'WARNING: only {len(segments)} segments — below 500-segment target.')

    print('Saving library ...')
    save_library(segments, meta, args.out_dir, args.window, args.stride, args.target_freq)

    if args.plot:
        print('Generating gallery ...')
        plot_gallery(segments, args.out_dir / 'noise_library_gallery.png')
        print('Generating motion bucket plot ...')
        plot_motion_buckets(segments, meta, args.out_dir / 'noise_library_buckets.png')

    print(f'\nDone. {len(segments)} segments, window={args.window}, stride={args.stride}')
    print(f'Mean drift: {np.mean([m["mean_drift"] for m in meta]):.4f} m')


if __name__ == '__main__':
    main()
