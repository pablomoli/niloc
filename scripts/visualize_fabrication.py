"""
Visualize the end-to-end fabrication pipeline (issues #6 + #8 + #9).

Uses Ana's real Avalon synthetic GT paths (data/avalon/synthetic_output/)
rather than artificially generated corridor paths.

Coordinate convention (same as universityA):
  gt_x = row index (height, 0-221), gt_y = col index (width, 0-411)
  Plot as (gt_y, gt_x) — col on x-axis, row on y-axis — to align with imshow.

Avalon grid (niloc-fork niloc/config/grid/avalon_2nd_floor.yaml):
  size: [411, 221]  width=411  height=221  dpi: 10.0 px/m

Outputs saved to outputs/viz/:
  fabrication_pipeline.png    — GT paths on floorplan + noise signal + drift hist
  fabrication_drift_scale.png — wrong DPI (3.5) vs correct DPI (10) comparison

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

matplotlib.use("Agg")

LIBRARY      = Path("preprocess/data/noise_library.npy")
FLOORPLAN    = Path("data/avalon/floorplan.png")
AVALON_DIR   = Path("data/avalon/synthetic_output")
OUT_DIR      = Path("outputs/viz")

# Avalon grid dimensions (from niloc-fork niloc/config/grid/avalon_2nd_floor.yaml)
AVALON_COLS = 411   # width  (gt_y range 0-411)
AVALON_ROWS = 221   # height (gt_x range 0-221)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_avalon_gt_paths() -> list[np.ndarray]:
    """
    Load real Avalon synthetic GT paths from Ana's simulator output.

    Files have columns: ts_seconds, smooth_x, smooth_y, gt_x, gt_y
    smooth_x == gt_x (no noise injected yet — clean A* paths).
    Returns list of (T, 5) arrays in the same format as universityA .txt files.
    """
    paths = []
    for txt in sorted(AVALON_DIR.glob("floorplan_avalon_*.txt")):
        data = np.loadtxt(txt, comments="#")
        if data.ndim == 1:
            data = data.reshape(1, -1)
        if data.shape[1] != 5:
            continue
        paths.append(data)
    return paths


# ---------------------------------------------------------------------------
# Plot 1: pipeline overview — GT on floorplan, noise signal, drift histogram
# ---------------------------------------------------------------------------

def plot_pipeline(
    gt_paths: list[np.ndarray],
    results: list[dict],
    out: Path,
) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    floorplan = mpimg.imread(str(FLOORPLAN)) if FLOORPLAN.exists() else None

    # Left: GT paths on Avalon floorplan
    ax = axes[0]
    if floorplan is not None:
        ax.imshow(floorplan, origin="upper",
                  extent=[0, AVALON_COLS, AVALON_ROWS, 0], alpha=0.6)
    colors = plt.cm.tab10(np.linspace(0, 1, min(len(results), 10)))  # type: ignore[attr-defined]
    for r, color in zip(results[:10], colors):
        gt = r["gt_xy"]  # col0=gt_x(row), col1=gt_y(col)
        ax.plot(gt[:, 1], gt[:, 0], linewidth=1.5, color=color, alpha=0.9)
    ax.set_title(f"GT paths on Avalon floorplan\n"
                 f"({len(gt_paths)} real simulator paths, 1 fps)")
    ax.set_xlabel("gt_y (col, 0-411)")
    ax.set_ylabel("gt_x (row, 0-221)")
    ax.set_xlim(0, AVALON_COLS)
    ax.set_ylim(AVALON_ROWS, 0)

    # Middle: noise signal over time for sample trajectories
    # Plotting absolute noisy positions is misleading since open-loop VIO
    # drifts far outside building bounds. Show drift magnitude instead.
    ax2 = axes[1]
    for r, color in zip(results[:10], colors):
        drift_mag = np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1)
        ax2.plot(drift_mag, linewidth=1.0, color=color, alpha=0.7)
    mean_drift_m = np.mean([
        np.mean(np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1))
        for r in results
    ]) / AVALON_DPI
    ax2.axhline(mean_drift_m * AVALON_DPI, color="crimson", linestyle="--",
                linewidth=1.2, label=f"mean {mean_drift_m:.1f} m")
    ax2.set_title(f"VIO drift magnitude over session\n"
                  f"noise scale={AVALON_DPI/SOURCE_DPI:.1f}x  (open-loop, no loop closure)")
    ax2.set_xlabel("Frame")
    ax2.set_ylabel("Drift magnitude (px at Avalon DPI)")
    ax2.legend()

    # Right: drift distribution in meters
    ax3 = axes[2]
    mean_drifts_px = [
        float(np.mean(np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1)))
        for r in results
    ]
    mean_drifts_m = [d / AVALON_DPI for d in mean_drifts_px]
    ax3.hist(mean_drifts_m, bins=12, color="steelblue", edgecolor="white", linewidth=0.5)
    ax3.axvline(float(np.mean(mean_drifts_m)), color="crimson", linestyle="--",
                label=f"mean {np.mean(mean_drifts_m):.1f} m")
    ax3.set_xlabel("Mean drift per trajectory (m)")
    ax3.set_ylabel("Count")
    ax3.set_title(f"Drift distribution — {len(results)} fabricated trajectories\n"
                  f"(NILOC uses relative VIO steps, not absolute position)")
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
    wrong   = fabricate(gt_paths, segments, n_out=15, aug_mult=1,
                        target_dpi=3.5, rng=rng_a)
    correct = fabricate(gt_paths, segments, n_out=15, aug_mult=1,
                        target_dpi=AVALON_DPI, rng=rng_b)

    floorplan = mpimg.imread(str(FLOORPLAN)) if FLOORPLAN.exists() else None

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    entries = [
        (axes[0], wrong,   3.5,        "Wrong DPI=3.5  (sprint planning assumption)"),
        (axes[1], correct, AVALON_DPI, f"Correct DPI={AVALON_DPI}  (Ana, commit 260a09a)"),
    ]
    for ax, results, dpi, label in entries:
        if floorplan is not None:
            ax.imshow(floorplan, origin="upper",
                      extent=[0, AVALON_COLS, AVALON_ROWS, 0], alpha=0.6)
        colors = plt.cm.tab10(np.linspace(0, 1, len(results)))  # type: ignore[attr-defined]
        for r, color in zip(results, colors):
            gt  = r["gt_xy"]
            ax.plot(gt[:, 1], gt[:, 0], linewidth=1.5, color=color, alpha=0.9)
        mean_d_m = float(np.mean([
            np.mean(np.linalg.norm(r["noisy_xy"] - r["gt_xy"], axis=1))
            for r in results
        ])) / dpi
        scale = dpi / SOURCE_DPI
        ax.set_title(f"{label}\nscale={scale:.2f}x  mean drift={mean_d_m:.1f} m")
        ax.set_xlabel("gt_y (col, 0-411)")
        ax.set_ylabel("gt_x (row, 0-221)")
        ax.set_xlim(0, AVALON_COLS)
        ax.set_ylim(AVALON_ROWS, 0)

    plt.suptitle(
        "GT paths on Avalon floorplan — DPI only affects noise scale, not GT",
        fontsize=12,
    )
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
        print(f"WARNING: Avalon floorplan not found at {FLOORPLAN}")

    if not AVALON_DIR.exists() or not list(AVALON_DIR.glob("*.txt")):
        print(f"ERROR: No Avalon GT paths found at {AVALON_DIR}")
        return

    print("Loading noise library ...")
    segments, _ = load_noise_library(LIBRARY)
    print(f"  {len(segments)} segments  shape={segments.shape}")

    print("Loading real Avalon GT paths ...")
    gt_paths = _load_avalon_gt_paths()
    lengths = [len(p) for p in gt_paths]
    print(f"  {len(gt_paths)} paths  lengths: min={min(lengths)} max={max(lengths)} "
          f"mean={int(np.mean(lengths))}")

    print(f"Fabricating trajectories at AVALON_DPI={AVALON_DPI} ...")
    results = fabricate(gt_paths, segments, n_out=len(gt_paths) * 3, aug_mult=3,
                        target_dpi=AVALON_DPI, rng=np.random.default_rng(7))
    print(f"  {len(results)} fabricated trajectories")

    plot_pipeline(gt_paths, results, OUT_DIR / "fabrication_pipeline.png")
    plot_dpi_comparison(gt_paths, segments, OUT_DIR / "fabrication_drift_scale.png")

    print(f"\nAll plots saved to {OUT_DIR}/")


if __name__ == "__main__":
    main()
