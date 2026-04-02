"""
Visualize the end-to-end fabrication pipeline (issues #6 + #8 + #9).

Runs: noise library -> inject at AVALON_DPI=10 -> write_dataset -> plot.

Coordinate convention (same as universityA):
  gt_x = row index (height, 0-221), gt_y = col index (width, 0-411)
  Plot as (gt_y, gt_x) — col on x-axis, row on y-axis — to align with imshow.

Avalon grid (from niloc-fork niloc/config/grid/avalon_2nd_floor.yaml):
  size: [411, 221]  dpi: 10.0 px/m  cell_length: 1.0

Outputs saved to outputs/viz/:
  fabrication_pipeline.png    — GT paths vs VIO-noisy paths + drift histogram
  fabrication_drift_scale.png — side-by-side: wrong DPI (3.5) vs correct DPI (10)

Usage
-----
  uv run python scripts/visualize_fabrication.py
"""

from __future__ import annotations

from pathlib import Path

import matplotlib
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np

from preprocess.synthetic_data.inject_noise import (
    AVALON_DPI,
    SOURCE_DPI,
    fabricate,
    load_noise_library,
)
from preprocess.synthetic_data.smooth_junctions import smooth_junctions

matplotlib.use("Agg")

LIBRARY       = Path("preprocess/data/noise_library.npy")
FLOORPLAN     = Path("../niloc-fork/niloc/data/avalon/floorplan.png")
OUT_DIR       = Path("outputs/viz")

# Avalon 2nd floor — from niloc-fork niloc/config/grid/avalon_2nd_floor.yaml
# size:[411,221], bounds:[0,411,0,221], dpi:10, cell_length:1.0
# The PNG is 411x221 so grid coordinates map 1:1 to image pixels.
AVALON_COLS = 411   # width  (gt_y range)
AVALON_ROWS = 221   # height (gt_x range)


# ---------------------------------------------------------------------------
# Synthetic GT path generation
# ---------------------------------------------------------------------------

# Approximate corridor centerlines for Avalon 2nd floor based on floorplan.
# These are horizontal/vertical corridor runs that keep paths inside walkable area.
# Row numbers (gt_x): main corridors run roughly at rows 50, 110, 170.
# Col numbers (gt_y): vertical runs at cols 80, 200, 320.
_CORRIDOR_ROWS = [50, 80, 110, 140, 170]
_CORRIDOR_COLS = [60, 130, 200, 280, 360]


def _make_gt_paths(n: int = 10, seed: int = 42) -> list[np.ndarray]:
    """
    Generate n synthetic piecewise-linear GT paths mimicking A* corridor paths.

    Paths are axis-aligned (horizontal or vertical moves between corridor
    intersections) to reflect real building navigation, then junction-smoothed.
    Each path is a (T, 5) array with columns ts, x, y, gt_x, gt_y (x == gt_x).
    """
    rng = np.random.default_rng(seed)
    intersections = [
        (r, c) for r in _CORRIDOR_ROWS for c in _CORRIDOR_COLS
    ]
    paths = []
    for _ in range(n):
        n_stops = rng.integers(3, 7)
        chosen = [intersections[i] for i in rng.choice(len(intersections),
                                                        size=n_stops, replace=False)]
        pts: list[np.ndarray] = []
        for i in range(len(chosen) - 1):
            r0, c0 = chosen[i]
            r1, c1 = chosen[i + 1]
            # Axis-aligned: first move along row, then along column
            corner = (r0, c1)
            for p0, p1 in [(np.array([r0, c0], dtype=float),
                            np.array([corner[0], corner[1]], dtype=float)),
                           (np.array([corner[0], corner[1]], dtype=float),
                            np.array([r1, c1], dtype=float))]:
                dist = np.linalg.norm(p1 - p0)
                if dist < 1.0:
                    continue
                n_frames = max(int(dist * 2), 5)
                pts.append(np.linspace(p0, p1, n_frames, endpoint=False))
        if not pts:
            continue
        raw = np.concatenate(pts, axis=0)
        smoothed, _ = smooth_junctions(raw, angle_threshold_deg=15.0, half_window=20)
        T = len(smoothed)
        ts = np.arange(T, dtype=np.float64)
        # columns: ts, x, y, gt_x, gt_y  (x == gt_x, y == gt_y — no noise yet)
        traj = np.column_stack([ts, smoothed, smoothed])
        paths.append(traj)
    return paths


# ---------------------------------------------------------------------------
# Plot 1: pipeline overview — GT vs noisy, drift histogram
# ---------------------------------------------------------------------------

def plot_pipeline(
    gt_paths: list[np.ndarray],
    results: list[dict],
    out: Path,
) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    floorplan = mpimg.imread(str(FLOORPLAN)) if FLOORPLAN.exists() else None

    def _bg(ax: plt.Axes) -> None:
        if floorplan is not None:
            # PNG is 411x221, matches grid 1:1 — no extent rescaling needed
            ax.imshow(floorplan, origin="upper",
                      extent=[0, AVALON_COLS, AVALON_ROWS, 0], alpha=0.5)

    # Left: GT paths on floorplan
    ax = axes[0]
    _bg(ax)
    for traj in gt_paths:
        # gt_x=col3 (row), gt_y=col4 (col) — plot (col, row) = (gt_y, gt_x)
        ax.plot(traj[:, 4], traj[:, 3], linewidth=1.5, alpha=0.85)
    ax.set_title("GT paths (synthetic A* + junction smoothing)")
    ax.set_xlabel("gt_y (col, 0-411)")
    ax.set_ylabel("gt_x (row, 0-221)")
    ax.set_xlim(0, AVALON_COLS)
    ax.set_ylim(AVALON_ROWS, 0)

    # Middle: noisy paths overlaid on GT — axes follow the data, not the building bounds.
    # VIO drift genuinely pushes paths outside the building; NILOC uses relative motion
    # steps, not absolute position, so out-of-bounds noisy paths are valid training data.
    ax2 = axes[1]
    colors = plt.cm.tab10(np.linspace(0, 1, len(results)))  # type: ignore[attr-defined]
    for r, color in zip(results, colors):
        gt  = r["gt_xy"]
        nxy = r["noisy_xy"]
        ax2.plot(gt[:, 1],  gt[:, 0],  linewidth=1.5, color=color, alpha=0.9)
        ax2.plot(nxy[:, 1], nxy[:, 0], linewidth=0.8, color=color, alpha=0.4,
                 linestyle="--")
    # Draw building outline for reference
    from matplotlib.patches import Rectangle  # noqa: PLC0415
    ax2.add_patch(Rectangle((0, 0), AVALON_COLS, AVALON_ROWS,
                             fill=False, edgecolor="white", linewidth=1.5,
                             linestyle=":", label="building bounds"))
    ax2.legend(fontsize=7, loc="upper right")
    ax2.set_title(
        f"Fabricated trajectories (AVALON_DPI={AVALON_DPI})\n"
        f"solid=GT  dashed=VIO  scale={AVALON_DPI/SOURCE_DPI:.1f}x  "
        f"(VIO may exceed building bounds — normal for open-loop)"
    )
    ax2.set_xlabel("gt_y (col)")
    ax2.set_ylabel("gt_x (row)")
    ax2.invert_yaxis()
    ax2.set_aspect("equal")

    # Right: drift distribution
    ax3 = axes[2]
    mean_drifts = [
        float(np.mean(np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1)))
        for r in results
    ]
    ax3.hist(mean_drifts, bins=15, color="steelblue", edgecolor="white", linewidth=0.5)
    ax3.axvline(float(np.mean(mean_drifts)), color="crimson", linestyle="--",
                label=f"mean {np.mean(mean_drifts):.1f} px "
                      f"({np.mean(mean_drifts)/AVALON_DPI:.1f} m)")
    ax3.set_xlabel("Mean drift per trajectory (px)")
    ax3.set_ylabel("Count")
    ax3.set_title(f"Drift at Avalon DPI={AVALON_DPI} px/m\n"
                  f"({len(results)} fabricated trajectories)\n"
                  f"NILOC uses relative VIO steps — absolute drift is expected")
    ax3.legend()

    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f"saved {out}")


# ---------------------------------------------------------------------------
# Plot 2: DPI comparison — wrong (3.5) vs correct (10.0)
# ---------------------------------------------------------------------------

def plot_dpi_comparison(
    gt_paths: list[np.ndarray],
    segments: np.ndarray,
    out: Path,
) -> None:
    rng_a = np.random.default_rng(0)
    rng_b = np.random.default_rng(0)
    wrong   = fabricate(gt_paths, segments, n_out=10, aug_mult=1,
                        target_dpi=3.5, rng=rng_a)
    correct = fabricate(gt_paths, segments, n_out=10, aug_mult=1,
                        target_dpi=AVALON_DPI, rng=rng_b)

    floorplan = mpimg.imread(str(FLOORPLAN)) if FLOORPLAN.exists() else None

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    entries = [
        (axes[0], wrong,   3.5,        "Wrong DPI=3.5  (sprint planning assumption)"),
        (axes[1], correct, AVALON_DPI, f"Correct DPI={AVALON_DPI}  (Ana, commit 260a09a)"),
    ]
    for ax, results, dpi, label in entries:
        if floorplan is not None:
            ax.imshow(floorplan, origin="upper",
                      extent=[0, AVALON_COLS, AVALON_ROWS, 0], alpha=0.5)
        colors = plt.cm.tab10(np.linspace(0, 1, len(results)))  # type: ignore[attr-defined]
        for r, color in zip(results, colors):
            gt  = r["gt_xy"]
            nxy = r["noisy_xy"]
            ax.plot(gt[:, 1],  gt[:, 0],  linewidth=1.5, color=color, alpha=0.9)
            ax.plot(nxy[:, 1], nxy[:, 0], linewidth=0.8, color=color, alpha=0.45,
                    linestyle="--")
        mean_d = float(np.mean([
            np.mean(np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1))
            for r in results
        ]))
        scale = dpi / SOURCE_DPI
        from matplotlib.patches import Rectangle  # noqa: PLC0415
        ax.add_patch(Rectangle((0, 0), AVALON_COLS, AVALON_ROWS,
                                fill=False, edgecolor="white", linewidth=1.2,
                                linestyle=":", zorder=5))
        ax.set_title(f"{label}\nscale={scale:.2f}x  mean drift={mean_d:.0f} px "
                     f"({mean_d/dpi:.1f} m)")
        ax.set_xlabel("gt_y (col)")
        ax.set_ylabel("gt_x (row)")
        ax.invert_yaxis()
        ax.set_aspect("equal")

    plt.suptitle("DPI mismatch impact on fabricated VIO drift", fontsize=13)
    plt.tight_layout()
    plt.savefig(out, dpi=150)
    plt.close(fig)
    print(f"saved {out}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not LIBRARY.exists():
        print(f"noise library not found at {LIBRARY} — run build_noise_library.py first")
        return

    if not FLOORPLAN.exists():
        print(f"WARNING: Avalon floorplan not found at {FLOORPLAN} — plotting without background")

    print("Loading noise library ...")
    segments, _ = load_noise_library(LIBRARY)
    print(f"  {len(segments)} segments  shape={segments.shape}")

    print("Generating synthetic GT paths ...")
    gt_paths = _make_gt_paths(n=10)
    print(f"  {len(gt_paths)} paths, lengths: {[len(p) for p in gt_paths]}")

    print(f"Fabricating trajectories at AVALON_DPI={AVALON_DPI} ...")
    results = fabricate(gt_paths, segments, n_out=20, aug_mult=2,
                        target_dpi=AVALON_DPI, rng=np.random.default_rng(7))
    print(f"  {len(results)} fabricated trajectories")

    plot_pipeline(gt_paths, results, OUT_DIR / "fabrication_pipeline.png")
    plot_dpi_comparison(gt_paths, segments, OUT_DIR / "fabrication_drift_scale.png")

    print(f"\nAll plots saved to {OUT_DIR}/")


if __name__ == "__main__":
    main()
