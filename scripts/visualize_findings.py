"""
Visualize findings from sprint issues #2, #3, and #8.

Coordinate convention
---------------------
universityA .txt columns: ts, x, y, gt_x, gt_y where
  gt_x = row index (height dimension, 0-184)
  gt_y = col index (width dimension,  0-136)

matplotlib imshow maps x-axis -> columns, y-axis -> rows. All floorplan
overlays in this script therefore plot (gt_y, gt_x) — col on x, row on y.
Plotting (gt_x, gt_y) causes a 90-degree rotation and pushes trajectories
outside the floorplan bounds.

Outputs saved to outputs/viz/:
  noise_magnitude_over_time.png   — issue #2: drift growth across trajectories
  noise_autocorrelation.png       — issue #2: ACF of raw noise signal
  trajectories_on_floorplan.png   — issue #2: GT and VIO overlaid on building map
  noise_segment_gallery.png       — issue #3: sample segments from noise library
  junction_smoothing.png          — issue #8: before/after smoothing on a synthetic A* path

Usage
-----
  uv run python scripts/visualize_findings.py
"""

from __future__ import annotations

from pathlib import Path

import matplotlib
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np
from statsmodels.tsa.stattools import acf

from preprocess.synthetic_data.smooth_junctions import smooth_junctions

matplotlib.use('Agg')

DATA_DIR   = Path('data/universityA')
LIBRARY    = Path('preprocess/data/noise_library.npy')
OUT_DIR    = Path('outputs/viz')
DPI_SRC    = 2.5
N_LAGS     = 150
TS, X, Y, GTX, GTY = 0, 1, 2, 3, 4


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def _load_train_trajectories() -> dict[str, np.ndarray]:
    train = set((DATA_DIR / 'train.txt').read_text().splitlines())
    excluded = (
        set((DATA_DIR / 'val.txt').read_text().splitlines()) |
        set((DATA_DIR / 'test.txt').read_text().splitlines())
    )
    trajs: dict[str, np.ndarray] = {}
    for txt in sorted(DATA_DIR.glob('*.txt')):
        name = txt.stem
        if name in ('train', 'val', 'test') or name in excluded or name not in train:
            continue
        trajs[name] = np.loadtxt(txt, comments='#')
    return trajs


def _noise(traj: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    nx  = traj[:, X]   - traj[:, GTX]
    ny  = traj[:, Y]   - traj[:, GTY]
    mag = np.sqrt(nx**2 + ny**2)
    return nx, ny, mag


# ---------------------------------------------------------------------------
# Issue #2: noise magnitude over time
# ---------------------------------------------------------------------------

def plot_noise_magnitude(trajs: dict[str, np.ndarray], out: Path) -> None:
    rng = np.random.default_rng(42)
    sample = rng.choice(list(trajs.keys()), size=20, replace=False)

    all_mags = np.concatenate([_noise(t)[2] for t in trajs.values()])
    global_mean = all_mags.mean()

    fig, axes = plt.subplots(2, 1, figsize=(14, 8))

    ax = axes[0]
    for name in sample:
        ax.plot(_noise(trajs[name])[2], alpha=0.55, linewidth=0.8)
    ax.axhline(global_mean, color='crimson', linestyle='--', linewidth=1.4,
               label=f'Global mean {global_mean:.0f} px ({global_mean/DPI_SRC:.0f} m)')
    ax.set_xlabel('Frame index')
    ax.set_ylabel('|noise| (px)')
    ax.set_title('VIO drift magnitude over time — 20 sample train trajectories')
    ax.legend()

    ax2 = axes[1]
    final_drifts = [_noise(t)[2][-1] for t in trajs.values()]
    ax2.hist(final_drifts, bins=30, color='steelblue', edgecolor='white', linewidth=0.5)
    ax2.axvline(float(np.mean(final_drifts)), color='crimson', linestyle='--',
                label=f'Mean {np.mean(final_drifts):.0f} px')
    ax2.set_xlabel('Final drift magnitude (px)')
    ax2.set_ylabel('Count')
    ax2.set_title('Distribution of trajectory-end drift — all 100 train trajectories')
    ax2.legend()

    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f'saved {out}')


# ---------------------------------------------------------------------------
# Issue #2: autocorrelation
# ---------------------------------------------------------------------------

def plot_autocorrelation(trajs: dict[str, np.ndarray], out: Path) -> None:
    rng = np.random.default_rng(42)
    sample = rng.choice(list(trajs.keys()), size=20, replace=False)

    acf_x, acf_y = [], []
    for name in sample:
        nx, ny, _ = _noise(trajs[name])
        if len(nx) > N_LAGS + 2:
            acf_x.append(acf(nx, nlags=N_LAGS, fft=True))
            acf_y.append(acf(ny, nlags=N_LAGS, fft=True))

    mean_x = np.array(acf_x).mean(axis=0)
    mean_y = np.array(acf_y).mean(axis=0)
    lags = np.arange(N_LAGS + 1)

    cx = next((i for i, v in enumerate(mean_x) if v < 0.5), N_LAGS)
    cy = next((i for i, v in enumerate(mean_y) if v < 0.5), N_LAGS)

    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(lags, mean_x, label=f'noise_x  (ACF<0.5 at lag {cx})', color='steelblue')
    ax.plot(lags, mean_y, label=f'noise_y  (ACF<0.5 at lag {cy})', color='tomato')
    ax.axhline(0.5, color='gray', linestyle=':', linewidth=1)
    ax.axhline(0.0, color='black', linewidth=0.5)
    ax.set_xlabel('Lag (frames)')
    ax.set_ylabel('Mean autocorrelation')
    ax.set_title('ACF of VIO noise signal — confirms temporally correlated (random-walk) drift')
    ax.legend()
    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f'saved {out}')


# ---------------------------------------------------------------------------
# Issue #3: noise segment gallery
# ---------------------------------------------------------------------------

def plot_segment_gallery(library_path: Path, out: Path) -> None:
    segments = np.load(library_path)
    rng = np.random.default_rng(42)
    idx = rng.choice(len(segments), size=20, replace=False)
    sample = segments[idx]

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    ax = axes[0]
    for seg in sample:
        ax.plot(np.sqrt(seg[:, 0]**2 + seg[:, 1]**2), alpha=0.6, linewidth=0.8)
    ax.set_xlabel('Frame within segment')
    ax.set_ylabel('|drift| (px)')
    ax.set_title(f'Noise library: drift magnitude — 20 random segments\n'
                 f'({len(segments)} total, window=400 frames)')

    ax2 = axes[1]
    for seg in sample:
        ax2.plot(seg[:, 0], seg[:, 1], alpha=0.5, linewidth=0.7)
    ax2.scatter([0], [0], color='red', zorder=5, s=30, label='start (0, 0)')
    ax2.set_xlabel('noise_x (px)')
    ax2.set_ylabel('noise_y (px)')
    ax2.set_title('Noise library: 2-D drift paths (normalized to origin)')
    ax2.legend()
    ax2.set_aspect('equal')

    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f'saved {out}')


# ---------------------------------------------------------------------------
# Issue #8: junction smoothing before/after
# ---------------------------------------------------------------------------

def plot_junction_smoothing(trajs: dict[str, np.ndarray], out: Path) -> None:
    # Use a real trajectory that likely has A*-like sharp turns (not perfectly smooth)
    # The universityA data is already smooth, but we can synthesize a representative
    # A* path to demonstrate the smoothing effect clearly
    # Build a synthetic piecewise-linear path with sharp turns (mimics raw A* output)
    segments_xy = [(0, 0), (80, 0), (80, 60), (140, 60), (140, 120), (200, 120)]
    path_pts: list[np.ndarray] = []
    for i in range(len(segments_xy) - 1):
        p0 = np.array(segments_xy[i], dtype=float)
        p1 = np.array(segments_xy[i + 1], dtype=float)
        n = int(np.linalg.norm(p1 - p0))
        path_pts.append(np.linspace(p0, p1, n, endpoint=False))
    raw = np.concatenate(path_pts, axis=0)

    smoothed, junctions = smooth_junctions(raw, angle_threshold_deg=15.0, half_window=20)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    ax = axes[0]
    ax.plot(raw[:, 0], raw[:, 1], color='steelblue', linewidth=1.5, label='Raw A* path')
    ax.plot(smoothed[:, 0], smoothed[:, 1], color='tomato', linewidth=1.5,
            linestyle='--', label='After junction smoothing')
    for jf in junctions:
        ax.axvline(raw[jf, 0], color='gray', linestyle=':', linewidth=0.8, alpha=0.6)
        ax.scatter(raw[jf, 0], raw[jf, 1], color='orange', zorder=5, s=40)
    ax.set_aspect('equal')
    ax.legend()
    ax.set_title(f'Junction smoothing — {len(junctions)} junctions detected\n'
                 f'(orange dots = detected junction frames)')
    ax.set_xlabel('x (px)')
    ax.set_ylabel('y (px)')

    ax2 = axes[1]
    v_raw      = np.linalg.norm(np.diff(raw, axis=0), axis=1)
    v_smoothed = np.linalg.norm(np.diff(smoothed, axis=0), axis=1)
    frames = np.arange(len(v_raw))
    ax2.plot(frames, v_raw,      color='steelblue', linewidth=1.2, label='Raw step size')
    ax2.plot(frames, v_smoothed, color='tomato',    linewidth=1.2,
             linestyle='--', label='Smoothed step size')
    for jf in junctions:
        ax2.axvline(jf, color='orange', linestyle=':', linewidth=0.8, alpha=0.8)
    ax2.set_xlabel('Frame')
    ax2.set_ylabel('Step size (px/frame)')
    ax2.set_title('Step-size uniformity before/after smoothing\n(spikes at junctions are reduced)')
    ax2.legend()

    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f'saved {out}')


# ---------------------------------------------------------------------------
# Trajectories on floorplan
# ---------------------------------------------------------------------------

def plot_trajectories_on_floorplan(trajs: dict[str, np.ndarray], out: Path) -> None:
    floorplan = mpimg.imread(str(DATA_DIR / 'floorplan.png'))
    rng = np.random.default_rng(99)
    sample = rng.choice(list(trajs.keys()), size=8, replace=False)

    h, w = floorplan.shape[:2]
    fig, ax = plt.subplots(figsize=(10, int(10 * h / w) + 1))
    ax.imshow(floorplan, origin='upper', extent=[0, w, h, 0])
    colors = plt.cm.tab10(np.linspace(0, 1, len(sample)))  # type: ignore[attr-defined]
    for name, color in zip(sample, colors):
        traj = trajs[name]
        # gt_x = row index, gt_y = col index; imshow x-axis = col, y-axis = row
        ax.plot(traj[:, GTY], traj[:, GTX], linewidth=1.2, color=color,
                alpha=0.85, label=f'{name} GT')
        ax.plot(traj[:, Y],   traj[:, X],   linewidth=0.7, color=color,
                alpha=0.4, linestyle='--')
    # Clamp axes to floorplan bounds so VIO drift outside the building doesn't stretch the plot
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)  # inverted: row 0 at top
    ax.legend(fontsize=7, ncol=2, loc='upper right')
    ax.set_title('8 train trajectories on universityA floorplan\nsolid=GT, dashed=VIO')
    ax.set_xlabel('col (gt_y)')
    ax.set_ylabel('row (gt_x)')
    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f'saved {out}')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('Loading trajectories ...')
    trajs = _load_train_trajectories()
    print(f'  {len(trajs)} trajectories')

    plot_noise_magnitude(trajs, OUT_DIR / 'noise_magnitude_over_time.png')
    plot_autocorrelation(trajs, OUT_DIR / 'noise_autocorrelation.png')
    plot_trajectories_on_floorplan(trajs, OUT_DIR / 'trajectories_on_floorplan.png')

    if LIBRARY.exists():
        plot_segment_gallery(LIBRARY, OUT_DIR / 'noise_segment_gallery.png')
    else:
        print(f'noise library not found at {LIBRARY} — run build_noise_library.py first')

    plot_junction_smoothing(trajs, OUT_DIR / 'junction_smoothing.png')

    print(f'\nAll plots saved to {OUT_DIR}/')


if __name__ == '__main__':
    main()
