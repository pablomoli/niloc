"""
Issue #29 — Validate fabricated vs real VIO feature distributions.

Compares fabricated synthetic sessions against real Avalon recordings across
four analysis layers:

  Layer 1 — Raw trajectory statistics (speed, heading change, path length)
  Layer 2 — VIO noise characteristics (drift from GT; fabricated only)
  Layer 3 — NILOC input features (VIO velocity sequences)
  Layer 4 — Spatial coverage (GT heatmap on floorplan; real uses VIO paths)

Real sessions have GT=0 throughout (RoNIN VIO-only recordings), so Layer 2 is
fabricated-only and Layer 4 uses VIO paths for real sessions.

Usage
-----
    uv run python -m preprocess.synthetic_data.validate_fab_vs_real
    uv run python -m preprocess.synthetic_data.validate_fab_vs_real \\
        --n-fab 200 --out-dir outputs/validation/fab_vs_real
"""

from __future__ import annotations

import argparse
import logging
import random
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm
from sklearn.decomposition import PCA

_LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants — derived from niloc/config/grid/avalon_2nd_floor.yaml
# ---------------------------------------------------------------------------

DPI_PX_PER_M = 10.0        # pixels per metre
FLOORPLAN_W = 411          # grid width (cols)
FLOORPLAN_H = 221          # grid height (rows)

REPO_ROOT = Path(__file__).resolve().parents[2]
FLOORPLAN_PNG = REPO_ROOT / "niloc/data/avalon/floorplan.png"

# Real sessions ship without GT (RoNIN VIO-only)
REAL_DIR = REPO_ROOT / "outputs/niloc_input_1hz"
REAL_GLOB = "*_resnet.txt"

FAB_DIR = REPO_ROOT / "outputs/fabricated/avalon_2nd_floor"
FAB_GLOB = "fab_*.txt"

DEFAULT_OUT = REPO_ROOT / "outputs/validation/fab_vs_real"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def load_sessions(directory: Path, glob: str, n_max: int | None = None) -> list[np.ndarray]:
    """
    Load all (or up to n_max random) sessions from directory.

    Each returned array has shape (T, 5): ts, vio_x, vio_y, gt_x, gt_y.
    Files with fewer than 5 rows are silently skipped (too short to analyse).
    """
    files = sorted(directory.glob(glob))
    if not files:
        raise FileNotFoundError(f"No files matched {directory}/{glob}")
    if n_max is not None and len(files) > n_max:
        rng = random.Random(42)
        files = rng.sample(files, n_max)
        files.sort()
    sessions = []
    for f in files:
        try:
            d = np.loadtxt(f)
            if d.ndim == 1:
                d = d[np.newaxis, :]
            if len(d) < 5:
                continue
            sessions.append(d.astype(np.float32))
        except Exception as exc:
            _LOG.warning("Skipping %s: %s", f.name, exc)
    _LOG.info("Loaded %d sessions from %s", len(sessions), directory)
    return sessions


def vio_velocities(sessions: list[np.ndarray]) -> np.ndarray:
    """
    Return all per-step VIO velocities (px/step) across sessions, shape (N, 2).
    """
    vels = []
    for d in sessions:
        vio = d[:, 1:3]
        vels.append(np.diff(vio, axis=0))
    return np.concatenate(vels, axis=0)


def gt_velocities(sessions: list[np.ndarray]) -> np.ndarray:
    """Return per-step GT velocities (px/step), shape (N, 2)."""
    vels = []
    for d in sessions:
        gt = d[:, 3:5]
        vels.append(np.diff(gt, axis=0))
    return np.concatenate(vels, axis=0)


def path_lengths_px(sessions: list[np.ndarray], use_gt: bool = True) -> np.ndarray:
    """Total arc-length of each trajectory in pixels."""
    lengths = []
    for d in sessions:
        traj = d[:, 3:5] if use_gt else d[:, 1:3]
        steps = np.diff(traj, axis=0)
        lengths.append(float(np.sum(np.linalg.norm(steps, axis=1))))
    return np.array(lengths, dtype=np.float32)


def drift_over_time(sessions: list[np.ndarray]) -> list[np.ndarray]:
    """
    For each session return per-frame Euclidean distance |VIO - GT| in pixels.
    Only meaningful for fabricated sessions (real GT = 0).
    """
    drifts = []
    for d in sessions:
        delta = d[:, 1:3] - d[:, 3:5]
        drifts.append(np.linalg.norm(delta, axis=1))
    return drifts


# ---------------------------------------------------------------------------
# Plot helpers
# ---------------------------------------------------------------------------


def _hist_overlay(ax, a, b, label_a, label_b, xlabel, bins=60, log=False):
    kw = dict(alpha=0.5, bins=bins, density=True)
    ax.hist(a, label=label_a, color="tab:blue", **kw)
    ax.hist(b, label=label_b, color="tab:orange", **kw)
    ax.set_xlabel(xlabel)
    ax.set_ylabel("density")
    if log:
        ax.set_yscale("log")
    ax.legend()


# ---------------------------------------------------------------------------
# Layer 1 — Raw trajectory statistics
# ---------------------------------------------------------------------------


def plot_layer1(fab: list[np.ndarray], real: list[np.ndarray], out: Path) -> None:
    """Speed, heading change, and path-length distributions."""

    # Fabricated uses GT path; real uses VIO path (no GT available)
    fab_steps = gt_velocities(fab)
    real_steps = vio_velocities(real)

    fab_speed = np.linalg.norm(fab_steps, axis=1) / DPI_PX_PER_M   # m/s
    real_speed = np.linalg.norm(real_steps, axis=1) / DPI_PX_PER_M

    def _headings(steps):
        return np.degrees(np.arctan2(steps[:, 1], steps[:, 0]))

    def _heading_changes(steps):
        h = _headings(steps)
        dh = np.diff(h)
        # wrap to [-180, 180]
        dh = (dh + 180) % 360 - 180
        return dh

    # Heading changes require per-session computation to avoid wraparound at seams
    fab_dh = np.concatenate([_heading_changes(np.diff(d[:, 3:5], axis=0)) for d in fab])
    real_dh = np.concatenate([_heading_changes(np.diff(d[:, 1:3], axis=0)) for d in real])

    fab_len = path_lengths_px(fab, use_gt=True) / DPI_PX_PER_M
    real_len = path_lengths_px(real, use_gt=False) / DPI_PX_PER_M

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    fig.suptitle("Layer 1 — Raw trajectory statistics\n"
                 "(fabricated: GT path; real: VIO path, no GT available)")

    _hist_overlay(axes[0], fab_speed, real_speed, "fabricated", "real",
                  "step speed (m/s)", bins=60)
    axes[0].set_title("Speed distribution")

    _hist_overlay(axes[1], fab_dh, real_dh, "fabricated", "real",
                  "heading change (deg/step)", bins=72)
    axes[1].set_title("Heading change distribution")

    _hist_overlay(axes[2], fab_len, real_len, "fabricated", "real",
                  "path length (m)", bins=40)
    axes[2].set_title("Path length distribution")

    fig.tight_layout()
    out_file = out / "layer1_trajectory_stats.png"
    fig.savefig(out_file, dpi=150)
    plt.close(fig)
    _LOG.info("Saved %s", out_file)


# ---------------------------------------------------------------------------
# Layer 2 — VIO noise characteristics (fabricated only)
# ---------------------------------------------------------------------------


def plot_layer2(fab: list[np.ndarray], out: Path) -> None:
    """Drift magnitude over time and heading error distribution."""

    drifts = drift_over_time(fab)
    max_len = max(len(d) for d in drifts)

    # Pad with NaN to align, then compute per-frame mean/p25/p75
    mat = np.full((len(drifts), max_len), np.nan, dtype=np.float32)
    for i, d in enumerate(drifts):
        mat[i, : len(d)] = d
    mean_drift = np.nanmean(mat, axis=0) / DPI_PX_PER_M
    p25 = np.nanpercentile(mat, 25, axis=0) / DPI_PX_PER_M
    p75 = np.nanpercentile(mat, 75, axis=0) / DPI_PX_PER_M
    t = np.arange(max_len)

    # Heading error: angle of (VIO - GT) vector
    fab_delta_vels = []
    for d in fab:
        vio_v = np.diff(d[:, 1:3], axis=0)
        gt_v = np.diff(d[:, 3:5], axis=0)
        moving = np.linalg.norm(gt_v, axis=1) > 0.5  # only when actually moving
        if moving.any():
            err = np.degrees(
                np.arctan2(vio_v[moving, 1], vio_v[moving, 0])
                - np.arctan2(gt_v[moving, 1], gt_v[moving, 0])
            )
            err = (err + 180) % 360 - 180
            fab_delta_vels.append(err)
    heading_err = np.concatenate(fab_delta_vels) if fab_delta_vels else np.array([])

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    fig.suptitle("Layer 2 — VIO noise characteristics (fabricated only; real GT unavailable)")

    axes[0].plot(t, mean_drift, color="tab:blue", label="mean drift")
    axes[0].fill_between(t, p25, p75, alpha=0.3, color="tab:blue", label="IQR")
    axes[0].set_xlabel("frame (s @ 1 Hz)")
    axes[0].set_ylabel("drift from GT (m)")
    axes[0].set_title("Drift magnitude over time")
    axes[0].legend()

    if len(heading_err):
        axes[1].hist(heading_err, bins=72, density=True, color="tab:blue", alpha=0.7)
    axes[1].set_xlabel("heading error (deg)")
    axes[1].set_ylabel("density")
    axes[1].set_title("VIO heading error distribution")

    fig.tight_layout()
    out_file = out / "layer2_vio_noise.png"
    fig.savefig(out_file, dpi=150)
    plt.close(fig)
    _LOG.info("Saved %s", out_file)


# ---------------------------------------------------------------------------
# Layer 3 — NILOC input features
# ---------------------------------------------------------------------------


def plot_layer3(fab: list[np.ndarray], real: list[np.ndarray], out: Path) -> None:
    """VIO velocity feature statistics and PCA comparison."""

    fab_v = vio_velocities(fab)    # (N_fab, 2)
    real_v = vio_velocities(real)  # (N_real, 2)

    fab_speed = np.linalg.norm(fab_v, axis=1) / DPI_PX_PER_M
    real_speed = np.linalg.norm(real_v, axis=1) / DPI_PX_PER_M

    # Per-session window statistics (window = 30 steps to match a reasonable chunk)
    window = 30

    def _window_stats(sessions):
        means, stds = [], []
        for d in sessions:
            v = np.diff(d[:, 1:3], axis=0)
            n = len(v)
            for start in range(0, n - window + 1, window):
                w = v[start: start + window]
                means.append(w.mean(axis=0))
                stds.append(w.std(axis=0))
        return np.array(means), np.array(stds)

    fab_means, fab_stds = _window_stats(fab)
    real_means, real_stds = _window_stats(real)

    # PCA on raw velocity vectors (subsample fab to balance with real)
    n_real = len(real_v)
    rng = np.random.default_rng(42)
    idx = rng.choice(len(fab_v), size=min(len(fab_v), n_real * 10), replace=False)
    fab_v_sub = fab_v[idx]
    all_v = np.concatenate([fab_v_sub, real_v], axis=0)
    pca = PCA(n_components=2)
    pca.fit(all_v)
    fab_pc = pca.transform(fab_v_sub)
    real_pc = pca.transform(real_v)

    fig, axes = plt.subplots(2, 3, figsize=(15, 9))
    fig.suptitle("Layer 3 — NILOC input features (VIO velocity sequences)")

    # Speed distribution
    _hist_overlay(axes[0, 0], fab_speed, real_speed, "fabricated", "real",
                  "VIO step speed (m/s)", bins=60)
    axes[0, 0].set_title("VIO speed distribution")

    # vx distribution
    _hist_overlay(axes[0, 1], fab_v[:, 0] / DPI_PX_PER_M,
                  real_v[:, 0] / DPI_PX_PER_M,
                  "fabricated", "real", "vx (m/s)", bins=60)
    axes[0, 1].set_title("VIO vx distribution")

    # vy distribution
    _hist_overlay(axes[0, 2], fab_v[:, 1] / DPI_PX_PER_M,
                  real_v[:, 1] / DPI_PX_PER_M,
                  "fabricated", "real", "vy (m/s)", bins=60)
    axes[0, 2].set_title("VIO vy distribution")

    # Window mean speed
    fab_wmean_speed = np.linalg.norm(fab_means, axis=1) / DPI_PX_PER_M
    real_wmean_speed = np.linalg.norm(real_means, axis=1) / DPI_PX_PER_M
    _hist_overlay(axes[1, 0], fab_wmean_speed, real_wmean_speed,
                  "fabricated", "real", "window mean speed (m/s)", bins=40)
    axes[1, 0].set_title(f"Window mean speed (w={window})")

    # Window std speed
    fab_wstd = np.linalg.norm(fab_stds, axis=1) / DPI_PX_PER_M
    real_wstd = np.linalg.norm(real_stds, axis=1) / DPI_PX_PER_M
    _hist_overlay(axes[1, 1], fab_wstd, real_wstd,
                  "fabricated", "real", "window velocity std (m/s)", bins=40)
    axes[1, 1].set_title(f"Window velocity std (w={window})")

    # PCA scatter
    ax = axes[1, 2]
    ax.scatter(fab_pc[:, 0], fab_pc[:, 1], s=2, alpha=0.3,
               color="tab:blue", label="fabricated", rasterized=True)
    ax.scatter(real_pc[:, 0], real_pc[:, 1], s=8, alpha=0.7,
               color="tab:orange", label="real")
    ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]:.1%})")
    ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]:.1%})")
    ax.set_title("PCA of VIO velocities")
    ax.legend()

    fig.tight_layout()
    out_file = out / "layer3_input_features.png"
    fig.savefig(out_file, dpi=150)
    plt.close(fig)
    _LOG.info("Saved %s", out_file)


# ---------------------------------------------------------------------------
# Layer 4 — Spatial coverage
# ---------------------------------------------------------------------------


def plot_layer4(fab: list[np.ndarray], real: list[np.ndarray], out: Path) -> None:
    """GT coverage heatmap (fab) and VIO path heatmap (real) on floorplan."""

    floorplan = plt.imread(str(FLOORPLAN_PNG))
    fp_h, fp_w = floorplan.shape[:2]

    def _coverage_map(sessions, use_gt):
        heatmap = np.zeros((fp_h, fp_w), dtype=np.float32)
        col_idx = slice(3, 5) if use_gt else slice(1, 3)
        for d in sessions:
            xy = d[:, col_idx]
            # col 0 = gt_x = row index, col 1 = gt_y = col index
            rows = np.round(xy[:, 0]).astype(int)
            cols = np.round(xy[:, 1]).astype(int)
            valid = (rows >= 0) & (rows < fp_h) & (cols >= 0) & (cols < fp_w)
            rows, cols = rows[valid], cols[valid]
            np.add.at(heatmap, (rows, cols), 1)
        return heatmap

    fab_hmap = _coverage_map(fab, use_gt=True)
    real_hmap = _coverage_map(real, use_gt=False)

    # Count covered walkable cells
    fab_cells = int((fab_hmap > 0).sum())
    real_cells = int((real_hmap > 0).sum())

    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    fig.suptitle("Layer 4 — Spatial coverage")

    kw = dict(cmap="hot", norm=LogNorm(vmin=1), alpha=0.85)

    axes[0].imshow(floorplan, cmap="gray")
    axes[0].imshow(np.where(fab_hmap > 0, fab_hmap, np.nan), **kw)
    axes[0].set_title(f"Fabricated GT paths ({len(fab)} sessions, {fab_cells:,} cells covered)")
    axes[0].axis("off")

    axes[1].imshow(floorplan, cmap="gray")
    axes[1].imshow(np.where(real_hmap > 0, real_hmap, np.nan), **kw)
    axes[1].set_title(f"Real VIO paths ({len(real)} sessions, {real_cells:,} cells covered)\n"
                      "(absolute position unknown — relative start shown)")
    axes[1].axis("off")

    fig.tight_layout()
    out_file = out / "layer4_spatial_coverage.png"
    fig.savefig(out_file, dpi=150)
    plt.close(fig)
    _LOG.info("Saved %s", out_file)


# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------


def write_summary(fab: list[np.ndarray], real: list[np.ndarray], out: Path) -> None:
    """Write a plain-text summary of key statistics."""

    def _stats(arr, unit=""):
        return (f"  mean={arr.mean():.3f}{unit}  std={arr.std():.3f}{unit}"
                f"  p5={np.percentile(arr,5):.3f}{unit}"
                f"  p95={np.percentile(arr,95):.3f}{unit}")

    fab_speed_gt = np.linalg.norm(gt_velocities(fab), axis=1) / DPI_PX_PER_M
    real_speed_vio = np.linalg.norm(vio_velocities(real), axis=1) / DPI_PX_PER_M
    fab_speed_vio = np.linalg.norm(vio_velocities(fab), axis=1) / DPI_PX_PER_M

    fab_len = path_lengths_px(fab, use_gt=True) / DPI_PX_PER_M
    real_len = path_lengths_px(real, use_gt=False) / DPI_PX_PER_M

    drifts = drift_over_time(fab)
    final_drifts = np.array([d[-1] for d in drifts]) / DPI_PX_PER_M

    lines = [
        "Issue #29 — Fabricated vs Real VIO Validation Summary",
        "=" * 56,
        "",
        f"Fabricated sessions: {len(fab)}",
        f"Real sessions:       {len(real)}",
        "",
        "--- Layer 1: Raw trajectory statistics ---",
        "GT speed per step (fab, m/s):",
        _stats(fab_speed_gt, " m/s"),
        "VIO speed per step (real, m/s):",
        _stats(real_speed_vio, " m/s"),
        "Path length (fab GT, m):",
        _stats(fab_len, " m"),
        "Path length (real VIO, m):",
        _stats(real_len, " m"),
        "",
        "--- Layer 2: VIO noise (fabricated only) ---",
        "Final-frame drift (m):",
        _stats(final_drifts, " m"),
        "",
        "--- Layer 3: VIO velocity features ---",
        "VIO speed per step (fab, m/s):",
        _stats(fab_speed_vio, " m/s"),
        "VIO speed per step (real, m/s):",
        _stats(real_speed_vio, " m/s"),
        f"Fab vx: mean={vio_velocities(fab)[:,0].mean()/DPI_PX_PER_M:.3f} m/s"
        f"  vy: mean={vio_velocities(fab)[:,1].mean()/DPI_PX_PER_M:.3f} m/s",
        f"Real vx: mean={vio_velocities(real)[:,0].mean()/DPI_PX_PER_M:.3f} m/s"
        f"  vy: mean={vio_velocities(real)[:,1].mean()/DPI_PX_PER_M:.3f} m/s",
    ]

    report = "\n".join(lines)
    out_file = out / "summary.txt"
    out_file.write_text(report)
    _LOG.info("Saved %s", out_file)
    print(report)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--n-fab", type=int, default=None,
                   help="Max fabricated sessions to load (default: all ~800)")
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT,
                   help=f"Output directory (default: {DEFAULT_OUT})")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    _LOG.info("Loading real sessions from %s", REAL_DIR)
    real = load_sessions(REAL_DIR, REAL_GLOB)

    _LOG.info("Loading fabricated sessions from %s (n_max=%s)", FAB_DIR, args.n_fab)
    fab = load_sessions(FAB_DIR, FAB_GLOB, n_max=args.n_fab)

    _LOG.info("Running Layer 1 — trajectory statistics")
    plot_layer1(fab, real, args.out_dir)

    _LOG.info("Running Layer 2 — VIO noise (fabricated only)")
    plot_layer2(fab, args.out_dir)

    _LOG.info("Running Layer 3 — NILOC input features")
    plot_layer3(fab, real, args.out_dir)

    _LOG.info("Running Layer 4 — spatial coverage")
    plot_layer4(fab, real, args.out_dir)

    _LOG.info("Writing summary")
    write_summary(fab, real, args.out_dir)

    _LOG.info("All outputs written to %s", args.out_dir)


if __name__ == "__main__":
    main()
