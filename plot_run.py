"""
Visualize inference output from a niloc eval run directory.

Usage:
    uv run python plot_run.py <run_dir>
    uv run python plot_run.py models/A/eval/version_0_out

Safe to run while inference is still in progress — plots whatever
trajectory files exist at the time.  Re-run to refresh.

Output: <run_dir>/trajectory_summary.png
"""

import json
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from pathlib import Path

try:
    from omegaconf import OmegaConf
    _HAVE_OMEGACONF = True
except ImportError:
    _HAVE_OMEGACONF = False

REPO = Path(__file__).resolve().parent

# ── design tokens (match build_pdf.py) ────────────────────────────────────────
BG       = "#13162a"
BG_DARK  = "#0b0d14"
BG_CARD  = "#0e1020"
ACCENT   = "#4f9cf9"
ACCENT2  = "#8b5cf6"
FG       = "#e2e6f0"
FG_DIM   = "#a0b0cc"
FG_FAINT = "#3a4468"
BORDER   = "#1e2540"


def _find_floorplan(config_path: Path):
    """Return (floorplan_array, dpi) from a saved run config.yaml, or (None, 1.0)."""
    if not config_path.exists() or not _HAVE_OMEGACONF:
        return None, 1.0
    try:
        cfg = OmegaConf.load(config_path)
        raw = cfg.grid.image_file          # e.g. "../niloc/data/avalon/floorplan.png"
        dpi = float(cfg.grid.dpi)
        # Try resolving relative to repo root, then by name search
        candidates = [
            REPO / raw,
            (config_path.parent / raw).resolve(),
        ]
        candidates += list(REPO.rglob(Path(raw).name))
        for p in candidates:
            if p.exists():
                return mpimg.imread(str(p)), dpi
    except Exception:
        pass
    return None, 1.0


def _style_ax(ax):
    ax.set_facecolor(BG_DARK)
    ax.set_xticks([])
    ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_color(BORDER)
        sp.set_linewidth(0.6)


def plot_run(run_dir: Path) -> Path:
    out_dir = run_dir / "out"
    traj_files = sorted(out_dir.glob("*_traj.txt")) if out_dir.exists() else []

    if not traj_files:
        # Try the run_dir itself (legacy flat layout)
        traj_files = sorted(run_dir.glob("*_traj.txt"))

    if not traj_files:
        print(f"No *_traj.txt files found under {run_dir}")
        return None

    floorplan, dpi = _find_floorplan(run_dir / "config.yaml")

    summary = None
    summary_path = run_dir / "summary.json"
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())

    n = len(traj_files)
    ncols = min(4, n)
    nrows = (n + ncols - 1) // ncols

    plt.rcParams.update({
        "font.family":      "sans-serif",
        "font.sans-serif":  ["Helvetica Neue", "Arial", "DejaVu Sans"],
        "text.color":       FG,
        "figure.facecolor": BG,
        "savefig.facecolor": BG,
    })

    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 4 * nrows + 0.8),
                             squeeze=False)
    fig.patch.set_facecolor(BG)

    errors_m = []

    for i, traj_file in enumerate(traj_files):
        ax = axes[i // ncols][i % ncols]
        _style_ax(ax)

        try:
            data = np.loadtxt(str(traj_file))
        except Exception as e:
            ax.set_title(f"{traj_file.stem}\n(load error)", fontsize=8, color=FG_FAINT)
            continue

        if data.ndim == 1:
            data = data[np.newaxis, :]
        if data.shape[1] < 5:
            ax.set_title(f"{traj_file.stem}\n(unexpected format)", fontsize=8, color=FG_FAINT)
            continue

        # columns: ts, pred_x(row), pred_y(col), gt_x(row), gt_y(col)
        pred_row, pred_col = data[:, 1], data[:, 2]
        gt_row,   gt_col   = data[:, 3], data[:, 4]

        if floorplan is not None:
            ax.imshow(floorplan, alpha=0.35, aspect="auto")

        # plot col on x-axis, row on y-axis (matches imshow convention)
        ax.plot(pred_col, pred_row, color=ACCENT,  linewidth=1.2, alpha=0.9)
        ax.plot(gt_col,   gt_row,   color=ACCENT2, linewidth=1.2, alpha=0.9)
        ax.plot(pred_col[0], pred_row[0], "o", color=ACCENT,  markersize=4)
        ax.plot(gt_col[0],   gt_row[0],   "o", color=ACCENT2, markersize=4)
        ax.plot(pred_col[-1], pred_row[-1], "s", color=ACCENT,  markersize=4)
        ax.plot(gt_col[-1],   gt_row[-1],   "s", color=ACCENT2, markersize=4)

        err_px = np.linalg.norm(
            np.stack([pred_row - gt_row, pred_col - gt_col], axis=1), axis=1
        )
        mean_err_m = float(np.mean(err_px)) / dpi
        errors_m.append(mean_err_m)

        ax.set_title(
            f"{traj_file.stem}\nmean err {mean_err_m:.1f} m",
            fontsize=8, color=FG_DIM, pad=4,
        )

    # hide unused subplots
    for i in range(n, nrows * ncols):
        axes[i // ncols][i % ncols].set_visible(False)

    # ── header ───────────────────────────────────────────────────────────────
    header = run_dir.name
    if errors_m:
        header += f"   |   mean {np.mean(errors_m):.1f} m over {n} trajectories"
    if summary:
        d1  = summary["distance"][1] * 100 if len(summary["distance"]) > 1 else None
        d5  = summary["distance"][9] * 100 if len(summary["distance"]) > 9 else None
        parts = []
        if d1  is not None: parts.append(f"≤1m {d1:.0f}%")
        if d5  is not None: parts.append(f"≤5m {d5:.0f}%")
        if parts:
            header += "   |   " + "   ".join(parts)

    fig.suptitle(header, fontsize=10, color=FG_DIM, y=1.0)

    # ── legend ───────────────────────────────────────────────────────────────
    handles = [
        plt.Line2D([0], [0], color=ACCENT,  linewidth=1.5, label="predicted"),
        plt.Line2D([0], [0], color=ACCENT2, linewidth=1.5, label="ground truth"),
    ]
    fig.legend(
        handles=handles, loc="lower center", ncol=2,
        facecolor=BG_CARD, edgecolor=BORDER, labelcolor=FG_DIM,
        fontsize=9, bbox_to_anchor=(0.5, -0.02),
    )

    fig.tight_layout(rect=[0, 0.03, 1, 0.98])

    out_path = run_dir / "trajectory_summary.png"
    fig.savefig(str(out_path), bbox_inches="tight", dpi=150, facecolor=BG)
    plt.close(fig)
    print(f"Saved: {out_path}  ({n} trajectories)")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    plot_run(Path(sys.argv[1]))
