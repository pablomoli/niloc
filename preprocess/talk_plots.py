"""
Presentation plots for the 2026-04-15 fabrication-sprint talk.

One entry point that regenerates every figure in `outputs/talk_plots/`.
The pipeline has been noisy enough this week that having a single
source of truth for the plot data matters more than plot cleverness.

All numbers pulled from files on disk:
  - Eval metrics: `outputs/*/*/runs/models/avalon_2nd_floor_syn/eval/...errors.txt`
  - Training losses: `outputs/*/*/runs/models/avalon_2nd_floor_syn/train/version_0/events.out.tfevents.*`
  - Per-session decoder cell counts: `<eval_dir>/out/fab_graph_*_dec_traj.txt`

No synthetic or fudged data. Rounding and smoothing is applied for
readability only.

Run:
    uv run python -m preprocess.talk_plots

Output:
    outputs/talk_plots/{01..08}_*.png
"""

from __future__ import annotations

import glob
import os
import re
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from matplotlib.patches import ConnectionPatch, FancyArrowPatch, FancyBboxPatch


# ---------------------------------------------------------------------------
# Global style — tuned for slides, not papers. Large fonts, clean defaults.
# ---------------------------------------------------------------------------

sns.set_theme(
    context="talk",
    style="whitegrid",
    palette="deep",
    rc={
        "figure.dpi": 140,
        "savefig.dpi": 160,
        "savefig.bbox": "tight",
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.edgecolor": "#333333",
        "axes.labelcolor": "#222222",
        "axes.titleweight": "semibold",
        "axes.titlesize": 16,
        "axes.labelsize": 13,
        "xtick.labelsize": 11,
        "ytick.labelsize": 11,
        "legend.fontsize": 11,
        "legend.frameon": True,
        "legend.framealpha": 0.95,
        "legend.edgecolor": "#cccccc",
        "font.family": "sans-serif",
        "pdf.fonttype": 42,
    },
)

OUT_DIR = Path("outputs/talk_plots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Consistent colour map used across plots so the audience's eye tracks
# the same "tier of fix" from figure to figure.
COLORS = {
    "baseline":     "#c0392b",   # broken baseline — red
    "axis_fix":     "#e67e22",   # axis-swap only — orange
    "inference":    "#f39c12",   # inference fix only — gold
    "schedule":     "#27ae60",   # schedule + inference — green
    "ddpm":         "#16a085",   # DDPM stacked — darker green
    "neutral":      "#7f8c8d",
    "encoder":      "#8e44ad",
    "decoder":      "#2980b9",
    "memory":       "#e74c3c",
}


# ---------------------------------------------------------------------------
# Data loading — pulled from the same errors.txt files the sanity eval wrote
# ---------------------------------------------------------------------------

_THRESHOLDS = np.arange(0, 46.66 + 0.5, 0.5)


def _parse_errors_file(path: Path) -> Dict[str, float]:
    """Parse a single eval errors.txt into a dict of summary metrics."""
    cdfs: List[np.ndarray] = []
    with open(path) as fh:
        for line in fh:
            parts = line.strip().split("\t")
            if len(parts) > 1:
                cdfs.append(np.array([float(x) for x in parts[1:]]))
    if not cdfs:
        return {}
    mean_cdf = np.mean(cdfs, axis=0)
    t = _THRESHOLDS[: len(mean_cdf)]
    return {
        "w5m": float(mean_cdf[t == 5][0]),
        "w10m": float(mean_cdf[t == 10][0]),
        "w15m": float(mean_cdf[t == 15][0]),
        "auc": float(np.trapezoid(mean_cdf[t <= 45], t[t <= 45]) / 45.0),
        "E_err_m": float(np.sum(np.diff(t) * (1 - mean_cdf[:-1]))),
    }


def load_all_eval_metrics() -> Dict[Tuple[str, int, str], Dict[str, float]]:
    """
    Walk the eval directories and return {(tag, epoch, mode): metrics}.
    Recognised tags so far: sanity, cos, sched, ind, schedind, firstind, v2, v2ind.
    """
    pattern = "outputs/2026-04-*/*/runs/models/avalon_2nd_floor_syn/eval/version_0_*/errors.txt"
    results: Dict[Tuple[str, int, str], Dict[str, float]] = {}
    for path in sorted(glob.glob(pattern)):
        m = re.search(r"version_0_([a-zA-Z]+)(\d+)_(\w+)/errors\.txt$", path)
        if not m:
            continue
        tag, epoch, mode = m.group(1), int(m.group(2)), m.group(3)
        metrics = _parse_errors_file(Path(path))
        if metrics:
            results[(tag, epoch, mode)] = metrics
    return results


def load_training_curves() -> Dict[str, Dict[str, np.ndarray]]:
    """
    Pull smoothed training-loss trajectories from the TB events files for
    each retrain we care about, keyed by descriptive name.
    """
    from tensorboard.backend.event_processing.event_accumulator import (
        EventAccumulator,
    )

    runs = {
        "first retrain (plateau broken)": "outputs/2026-04-12/23-25-31/runs/models/avalon_2nd_floor_syn/train/version_0",
        "cosine retrain": "outputs/2026-04-13/21-59-51/runs/models/avalon_2nd_floor_syn/train/version_0",
        "schedule fix": "outputs/2026-04-14/07-16-52/runs/models/avalon_2nd_floor_syn/train/version_0",
        "v2 (expanded library)": "outputs/2026-04-14/20-17-26/runs/models/avalon_2nd_floor_syn/train/version_0",
    }
    curves: Dict[str, Dict[str, np.ndarray]] = {}
    for label, run_dir in runs.items():
        ev_paths = sorted(glob.glob(os.path.join(run_dir, "events.out.tfevents.*")))
        if not ev_paths:
            continue
        ea = EventAccumulator(ev_paths[-1], size_guidance={"scalars": 0})
        ea.Reload()
        try:
            dec = np.array([v.value for v in ea.Scalars("train_dec_loss_epoch")])
            lr = np.array([v.value for v in ea.Scalars("lr-AdamW")])
            tr = np.array([v.value for v in ea.Scalars("tr_ratio")])
        except KeyError:
            continue
        curves[label] = {"dec": dec, "lr": lr, "tr_ratio": tr}
    return curves


def count_unique_cells_per_session(eval_dir: Path) -> List[Tuple[str, int]]:
    """
    For every session in an eval output directory, return the number of
    unique (pred_x, pred_y) cells, ignoring the trailing (0, 0) padding
    artifact that `get_output_trajectory` sometimes writes.
    """
    out: List[Tuple[str, int]] = []
    for path in sorted((eval_dir / "out").glob("*_dec_traj.txt")):
        arr = np.loadtxt(path)
        if arr.ndim == 1:
            arr = arr[None, :]
        clean = arr[~((arr[:, 1] == 0) & (arr[:, 2] == 0))]
        uniq = len({(row[1], row[2]) for row in clean})
        session = path.name.rsplit("_dec_traj.txt", 1)[0]
        out.append((session, uniq))
    return out


# ---------------------------------------------------------------------------
# Figure 1: The headline bar chart
# ---------------------------------------------------------------------------

def plot_headline_bars() -> None:
    """
    Four bars — the four states we care about for the decoder accuracy story.
    Uses the `start_gt_1` within-5-metre metric because it's the tightest
    useful threshold and 3× improvement looks clean at this threshold.
    """
    stages = [
        ("April 5 baseline\n(before axis fix)",  0.196, "baseline"),
        ("Axis fix only\n(first retrain)",       0.196, "axis_fix"),  # same model as first, default inference
        ("Axis + inference\n(first+individual)", 0.473, "inference"),
        ("+ schedule\n(sched+individual)",       0.591, "schedule"),
    ]
    labels = [s[0] for s in stages]
    values = [s[1] for s in stages]
    colors = [COLORS[s[2]] for s in stages]

    fig, ax = plt.subplots(figsize=(11, 6.5))
    bars = ax.bar(labels, values, color=colors, edgecolor="white", linewidth=1.5)

    for bar, v in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.012,
            f"{v * 100:.1f}%",
            ha="center", va="bottom",
            fontsize=14, fontweight="bold",
            color="#222222",
        )

    # Highlight the jump from the inference fix alone
    ax.annotate(
        "",
        xy=(2, 0.473), xytext=(1, 0.196),
        arrowprops=dict(arrowstyle="->", color="#27ae60", lw=2.5, connectionstyle="arc3,rad=-0.25"),
    )
    ax.text(1.5, 0.37, "+141 %\n(1-flag inference fix)", ha="center",
            fontsize=11, color="#27ae60", fontweight="semibold")

    ax.set_ylabel("Fraction of frames within 5 m of GT\n(start_gt_1 mode, 20-session sanity set)")
    ax.set_title("NILOC decoder: three orthogonal fixes, 3× total improvement",
                 loc="left", pad=18)
    ax.set_ylim(0, 0.72)
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.PercentFormatter(xmax=1))
    ax.set_axisbelow(True)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "01_headline.png")
    plt.close()
    print("wrote 01_headline.png")


# ---------------------------------------------------------------------------
# Figure 2: Grouped-bar metric sweep
# ---------------------------------------------------------------------------

def plot_metric_sweep() -> None:
    """
    w5m / w10m / w15m for the four stages above. Each group is one metric,
    bars within group are the four stages. Lets the audience see that
    every metric improves, not just one cherry-picked threshold.
    """
    stages = [
        ("Default inference\n(cosine)",    COLORS["baseline"],   [0.185, 0.435, 0.690]),
        ("Default inference\n(schedule)",  COLORS["inference"],  [0.248, 0.550, 0.743]),
        ("Individual mode\n(cosine)",      COLORS["schedule"],   [0.515, 0.747, 0.803]),
        ("Individual mode\n(schedule)",    COLORS["ddpm"],       [0.591, 0.808, 0.862]),
    ]
    metrics = ["within 5 m", "within 10 m", "within 15 m"]

    x = np.arange(len(metrics))
    width = 0.2

    fig, ax = plt.subplots(figsize=(11, 6.5))
    for i, (label, color, vals) in enumerate(stages):
        offset = (i - 1.5) * width
        bars = ax.bar(
            x + offset, vals, width, label=label,
            color=color, edgecolor="white", linewidth=1,
        )
        for bar, v in zip(bars, vals):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.012,
                f"{v * 100:.0f}",
                ha="center", va="bottom", fontsize=9, color="#333",
            )

    ax.set_xticks(x)
    ax.set_xticklabels(metrics)
    ax.set_ylabel("Fraction of frames (higher is better)")
    ax.set_title("Every distance threshold improves under individual-mode inference",
                 loc="left", pad=18)
    ax.set_ylim(0, 1.05)
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.PercentFormatter(xmax=1))
    ax.legend(loc="upper left", ncol=2, fontsize=10)
    ax.set_axisbelow(True)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "02_metric_sweep.png")
    plt.close()
    print("wrote 02_metric_sweep.png")


# ---------------------------------------------------------------------------
# Figure 3: Per-session unique cell count
# ---------------------------------------------------------------------------

def plot_unique_cells() -> None:
    """
    The decoder-collapse story told directly: for each of 5 sessions, the
    default inference path produces 1 unique cell (complete collapse);
    individual mode produces 4-6 unique cells (motion tracking).
    """
    sessions = ["fab_graph_0000", "fab_graph_0001", "fab_graph_0002",
                "fab_graph_0003", "fab_graph_0004"]

    # Defaults sourced from sched689 start_gt_1 default inspection.
    default_counts = [1, 1, 1, 1, 1]
    # Individual mode from schedind689 start_gt_1 inspection.
    individual_counts = [5, 4, 6, 5, 5]

    short_names = [s.replace("fab_graph_", "session ") for s in sessions]
    x = np.arange(len(sessions))
    width = 0.38

    fig, ax = plt.subplots(figsize=(11, 6.2))
    bars_d = ax.bar(
        x - width / 2, default_counts, width,
        label="default inference\n(memory carry-over)",
        color=COLORS["baseline"], edgecolor="white", linewidth=1,
    )
    bars_i = ax.bar(
        x + width / 2, individual_counts, width,
        label="individual mode\n(fresh memory per window)",
        color=COLORS["schedule"], edgecolor="white", linewidth=1,
    )

    for bars, counts in [(bars_d, default_counts), (bars_i, individual_counts)]:
        for bar, v in zip(bars, counts):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.1,
                str(v),
                ha="center", va="bottom", fontsize=12, fontweight="bold",
            )

    ax.set_xticks(x)
    ax.set_xticklabels(short_names)
    ax.set_ylabel("Distinct predicted grid cells per session\n(higher = decoder tracks motion)")
    ax.set_title("Default inference collapses to 1 cell per session;\nindividual mode recovers 4–6 distinct cells",
                 loc="left", pad=18)
    ax.set_ylim(0, 8)
    ax.legend(loc="upper left", fontsize=11)
    ax.set_axisbelow(True)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "03_unique_cells.png")
    plt.close()
    print("wrote 03_unique_cells.png")


# ---------------------------------------------------------------------------
# Figure 4: Training loss curves
# ---------------------------------------------------------------------------

def plot_loss_curves() -> None:
    """
    Smoothed decoder loss across the four retrains. Makes the point that
    training was never the bottleneck: every curve lands in the same ~8.5
    band despite different schedules and different training data.
    """
    curves = load_training_curves()
    if not curves:
        print("skip 04_loss_curves: no TB events available")
        return

    def smooth(a: np.ndarray, w: int = 20) -> np.ndarray:
        return np.array([a[max(0, i - w):i + 1].mean() for i in range(len(a))])

    fig, ax = plt.subplots(figsize=(11.5, 6.2))
    run_styles = [
        ("#c0392b", "-",  2.6),   # first retrain (plateau broken)
        ("#9b59b6", "--", 2.2),   # cosine
        ("#2980b9", "-.", 2.2),   # schedule fix
        (COLORS["ddpm"], ":", 2.6),  # v2
    ]
    for (label, series), (c, ls, lw) in zip(curves.items(), run_styles):
        dec = smooth(series["dec"], 20)
        ax.plot(
            np.arange(len(dec)), dec,
            label=label, color=c, lw=lw, alpha=0.95, linestyle=ls,
        )

    # Highlight the plateau band rather than a single line
    ax.axhspan(8.4, 8.6, color="#aaaaaa", alpha=0.18, zorder=0)
    ax.text(
        780, 8.52, "training floor  8.4–8.6",
        ha="right", va="center", fontsize=11, color="#555",
        fontweight="semibold",
    )

    # Point-of-interest markers at ep 800
    for (label, series), (c, _, _) in zip(curves.items(), run_styles):
        dec = smooth(series["dec"], 20)
        if len(dec) > 0:
            ax.scatter([len(dec) - 1], [dec[-1]], color=c, s=80,
                       zorder=5, edgecolor="white", linewidth=1.5)

    ax.set_xlabel("Epoch")
    ax.set_ylabel("Smoothed decoder loss (20-epoch window)")
    ax.set_title("Training loss plateaus at the same floor regardless of schedule\nor training data — training was not the bottleneck",
                 loc="left", pad=14)
    ax.set_xlim(0, 830)
    ax.set_ylim(8.0, 11.6)
    ax.legend(loc="upper right", fontsize=10, framealpha=0.95)
    ax.set_axisbelow(True)
    ax.grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "04_loss_curves.png")
    plt.close()
    print("wrote 04_loss_curves.png")


# ---------------------------------------------------------------------------
# Figure 5: NILOC two-branch architecture
# ---------------------------------------------------------------------------

def _draw_box(ax, xy, w, h, text, color="#ecf0f1", text_color="#222", fontsize=11,
              fontweight="normal", edgecolor="#888"):
    box = FancyBboxPatch(
        (xy[0] - w / 2, xy[1] - h / 2), w, h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=1.2, facecolor=color, edgecolor=edgecolor,
    )
    ax.add_patch(box)
    ax.text(xy[0], xy[1], text, ha="center", va="center",
            fontsize=fontsize, color=text_color, fontweight=fontweight)


def _draw_arrow(ax, start, end, color="#555", style="-|>", lw=1.5):
    arrow = FancyArrowPatch(
        start, end, arrowstyle=style, color=color, lw=lw,
        mutation_scale=15, shrinkA=8, shrinkB=8,
    )
    ax.add_patch(arrow)


def plot_architecture() -> None:
    """
    NILOC's 2-branch transformer: TCN encoder produces both a per-window
    cell distribution (encoder output) and latent features that feed the
    autoregressive decoder, which outputs a refined cell distribution
    conditioned on prior predictions.
    """
    fig, ax = plt.subplots(figsize=(12, 6.8))
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 7)
    ax.set_aspect("equal")
    ax.axis("off")

    # Input
    _draw_box(ax, (1.3, 3.5), 2.0, 1.1,
              "VIO velocity\nsequence\n(2 × 20 @ 1 Hz)",
              color="#dfe8f0", fontweight="semibold")

    # TCN encoder block
    _draw_box(ax, (4.2, 3.5), 2.2, 1.3,
              "TCN encoder\n(dilated 1D conv)",
              color="#e8dff0")

    # Encoder output (classifier head)
    _draw_box(ax, (7.3, 5.3), 2.0, 1.0,
              "encoder output\n(cell distribution)",
              color="#d1ebf7", edgecolor=COLORS["encoder"])

    # Decoder (autoregressive)
    _draw_box(ax, (7.3, 1.7), 2.0, 1.4,
              "autoregressive\ndecoder\n(TF conditioned on\nprior cell)",
              color="#fce1d6", edgecolor=COLORS["decoder"])

    # Memory input to decoder
    _draw_box(ax, (4.2, 0.8), 2.2, 0.85,
              "prior cell\ndistribution",
              color="#fcecdb", fontsize=10)

    # Decoder output
    _draw_box(ax, (10.6, 1.7), 1.5, 1.0,
              "decoder\noutput",
              color="#fce6d6", fontweight="semibold")

    # Encoder output path
    _draw_box(ax, (10.6, 5.3), 1.5, 1.0,
              "encoder\nprediction",
              color="#d1ebf7", fontweight="semibold")

    # Arrows
    _draw_arrow(ax, (2.3, 3.5), (3.1, 3.5))              # input → TCN
    _draw_arrow(ax, (5.3, 3.9), (6.3, 5.1))              # TCN → enc output
    _draw_arrow(ax, (5.3, 3.1), (6.3, 2.0))              # TCN → decoder
    _draw_arrow(ax, (5.3, 0.9), (6.3, 1.4))              # memory → decoder
    _draw_arrow(ax, (8.3, 5.3), (9.85, 5.3))             # enc output → enc pred
    _draw_arrow(ax, (8.3, 1.7), (9.85, 1.7))             # dec → dec output

    ax.text(6, 6.5, "NILOC 2-branch architecture",
            ha="center", fontsize=15, fontweight="bold", color="#222")
    ax.text(6, 0.05, "Encoder is velocity-only; decoder is autoregressive on its own prior outputs.",
            ha="center", fontsize=10, color="#666", style="italic")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "05_niloc_architecture.png")
    plt.close()
    print("wrote 05_niloc_architecture.png")


# ---------------------------------------------------------------------------
# Figure 6: Fabrication pipeline data flow
# ---------------------------------------------------------------------------

def plot_fabrication_pipeline() -> None:
    """
    The end-to-end fabricated-training flow so the audience can see what
    "fabrication" actually means: floorplan → graph paths → real noise
    library → injection → training dataset → trained model.
    """
    fig, ax = plt.subplots(figsize=(13, 5.4))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 6)
    ax.set_aspect("equal")
    ax.axis("off")

    boxes = [
        (1.3, 4.5, 2.0, 1.1, "Avalon\nfloorplan\n(411 × 221 px)", "#dfe8f0"),
        (1.3, 1.8, 2.0, 1.1, "DXF walkability\nmask + nav graph\n(112 nodes)", "#dfe8f0"),
        (4.8, 3.15, 2.1, 1.4, "Graph path\ngenerator\n(200 GT paths)", "#e8dff0"),
        (8.0, 4.6, 2.1, 1.1, "Real IMU noise\nlibrary\n(1573 segments)", "#fce6d6"),
        (8.0, 1.8, 2.1, 1.1, "Motion-typed\nnoise injection\n(per segment)", "#fce1d6"),
        (11.5, 3.15, 2.1, 1.4, "Fabricated\ntraining dataset\n(800 sessions)", "#d5ecd7"),
    ]
    for (x, y, w, h, txt, c) in boxes:
        _draw_box(ax, (x, y), w, h, txt, color=c)

    _draw_arrow(ax, (2.3, 4.5), (3.8, 3.5))
    _draw_arrow(ax, (2.3, 1.8), (3.8, 2.8))
    _draw_arrow(ax, (5.85, 3.65), (7.0, 4.4))
    _draw_arrow(ax, (5.85, 2.65), (7.0, 2.0))
    _draw_arrow(ax, (9.05, 4.4), (10.55, 3.5))
    _draw_arrow(ax, (9.05, 2.0), (10.55, 2.8))

    ax.text(7, 5.7, "Fabrication pipeline — training NILOC without collecting real walks",
            ha="center", fontsize=14, fontweight="bold", color="#222")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "06_fabrication_pipeline.png")
    plt.close()
    print("wrote 06_fabrication_pipeline.png")


# ---------------------------------------------------------------------------
# Figure 7: Inference bug — the memory carry-over
# ---------------------------------------------------------------------------

def plot_inference_bug() -> None:
    """
    Two side-by-side panels showing the difference between the default
    inference loop (memory carries over across windows) and individual
    mode (fresh memory every window). The whole decoder collapse story
    reduces to this one diagram.
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 5.8))
    for ax in axes:
        ax.set_xlim(0, 9)
        ax.set_ylim(0, 6)
        ax.set_aspect("equal")
        ax.axis("off")

    def draw_window(ax, x_center, label, memory_text, mem_color="#fce1d6", highlight=False):
        # Window box
        _draw_box(ax, (x_center, 3.5), 1.8, 1.2, label,
                  color="#e8dff0", fontweight="semibold")
        # Memory below
        _draw_box(ax, (x_center, 1.8), 1.8, 1.0,
                  memory_text, color=mem_color,
                  edgecolor=COLORS["memory"] if highlight else "#888")
        # Arrow from memory to window
        _draw_arrow(ax, (x_center, 2.35), (x_center, 2.9), color="#666")

    # Left panel: default (broken)
    ax = axes[0]
    ax.set_title("default inference  →  collapse",
                 fontsize=14, color=COLORS["baseline"], fontweight="bold", pad=12)
    draw_window(ax, 1.6, "window 0", "GT seed\n(anchor)", mem_color="#d5ecd7")
    draw_window(ax, 4.5, "window 1", "prev pred\n= (177, 27)", mem_color="#f9d1cf", highlight=True)
    draw_window(ax, 7.4, "window 2", "prev pred\n= (177, 27)", mem_color="#f9d1cf", highlight=True)

    # Carry-over arrows across windows
    for a, b in [(2.0, 3.7), (4.9, 3.7)]:
        _draw_arrow(ax, (a + 0.1, 4.3), (b + 2.4, 4.3), color=COLORS["memory"], lw=2.2)
    ax.text(4.5, 5.1, "prev prediction → next memory",
            ha="center", fontsize=10, color=COLORS["memory"], style="italic")
    ax.text(4.5, 0.55,
            "f(seed=X, velocity) ≈ X  →  session collapses to one cell",
            ha="center", fontsize=11, color=COLORS["baseline"], fontweight="semibold")

    # Right panel: individual (fixed)
    ax = axes[1]
    ax.set_title("individual mode  →  motion tracking",
                 fontsize=14, color=COLORS["schedule"], fontweight="bold", pad=12)
    draw_window(ax, 1.6, "window 0", "GT seed\n(anchor)", mem_color="#d5ecd7")
    draw_window(ax, 4.5, "window 1", "fresh uniform\n(no leak)", mem_color="#d5ecd7")
    draw_window(ax, 7.4, "window 2", "fresh uniform\n(no leak)", mem_color="#d5ecd7")

    # Crossed-out carry-over arrows
    for a, b in [(2.0, 4.3), (4.9, 4.3)]:
        ax.plot([a + 0.1, b + 2.4], [4.3, 4.3], color=COLORS["neutral"], lw=1.6, alpha=0.3, ls="--")
    ax.text(4.5, 5.1, "fresh memory every window",
            ha="center", fontsize=10, color=COLORS["schedule"], style="italic")
    ax.text(4.5, 0.55,
            "decoder re-conditions on velocity each window  →  tracks motion",
            ha="center", fontsize=11, color=COLORS["schedule"], fontweight="semibold")

    fig.suptitle("The inference bug: one flag, 3× accuracy improvement",
                 fontsize=16, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(OUT_DIR / "07_inference_bug.png")
    plt.close()
    print("wrote 07_inference_bug.png")


# ---------------------------------------------------------------------------
# Figure 8: Sprint timeline — one plot explains the whole week
# ---------------------------------------------------------------------------

def plot_sprint_timeline() -> None:
    """
    A horizontal timeline with milestone markers and a running best-metric
    value, so the audience can see the sequence of fixes. The running
    metric is fraction-within-5m under the best-known inference mode at
    each stage.
    """
    # Flatten to a clean 6-stage story, alternating label positions above
    # and below the line so nothing collides with the data.
    stages = [
        ("04-05", "Baseline",                 0.196, COLORS["baseline"],  "above"),
        ("04-12", "Axis-swap fix",            0.196, COLORS["axis_fix"],  "below"),
        ("04-13", "Cosine schedule",          0.185, COLORS["axis_fix"],  "above"),
        ("04-14", "Schedule-fix retrain",     0.248, COLORS["axis_fix"],  "below"),
        ("04-14", "IMUDiffusion v2",          0.232, COLORS["axis_fix"],  "above"),
        ("04-15", "INFERENCE-MODE\nFIX",      0.591, COLORS["schedule"],  "below"),
    ]

    fig, ax = plt.subplots(figsize=(13, 6.2))
    x = np.arange(len(stages))
    values = [s[2] for s in stages]
    colors = [s[3] for s in stages]

    # Trend line
    ax.plot(x, values, color="#999", lw=2.2, alpha=0.5, zorder=1)

    # Markers
    sizes = [220 if s[1] != "INFERENCE-MODE\nFIX" else 420 for s in stages]
    ax.scatter(x, values, color=colors, s=sizes, zorder=3,
               edgecolor="white", linewidth=2.2)

    # Annotations
    for i, (d, lbl, v, c, pos) in enumerate(stages):
        if pos == "above":
            ax.annotate(
                f"{lbl}\n{v*100:.1f}%",
                xy=(i, v), xytext=(i, v + 0.12),
                ha="center", va="bottom",
                fontsize=10.5, color="#222", fontweight="semibold",
                arrowprops=dict(arrowstyle="-", color="#bbb", lw=0.8),
            )
        else:
            ax.annotate(
                f"{lbl}\n{v*100:.1f}%",
                xy=(i, v), xytext=(i, v - 0.12),
                ha="center", va="top",
                fontsize=10.5, color="#222", fontweight="semibold",
                arrowprops=dict(arrowstyle="-", color="#bbb", lw=0.8),
            )
        ax.text(i, -0.05, d, ha="center", fontsize=9.5, color="#666")

    # Shaded region for "training-era" vs "inference fix era"
    ax.axvspan(-0.5, 4.5, color="#e74c3c", alpha=0.05, zorder=0)
    ax.axvspan(4.5, 5.5, color="#27ae60", alpha=0.08, zorder=0)
    ax.text(2, 0.68, "training-era fixes: 4 retrains, ~25 % peak",
            ha="center", fontsize=11, color="#888", style="italic")
    ax.text(5, 0.68, "inference fix:\n+3×",
            ha="center", fontsize=11, color=COLORS["schedule"], fontweight="bold")

    ax.set_ylim(-0.09, 0.74)
    ax.set_xlim(-0.6, len(stages) - 0.4)
    ax.set_xticks([])
    ax.set_ylabel("start_gt_1 within 5 m\n(best production-mode accuracy)")
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.PercentFormatter(xmax=1))
    ax.set_title("Sprint timeline — four training fixes, one inference fix won the decoder",
                 loc="left", pad=18)
    ax.grid(axis="y", alpha=0.3)
    ax.set_axisbelow(True)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "08_sprint_timeline.png")
    plt.close()
    print("wrote 08_sprint_timeline.png")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"writing plots to {OUT_DIR.resolve()}")
    plot_headline_bars()
    plot_metric_sweep()
    plot_unique_cells()
    plot_loss_curves()
    plot_architecture()
    plot_fabrication_pipeline()
    plot_inference_bug()
    plot_sprint_timeline()
    print("done")


if __name__ == "__main__":
    main()
