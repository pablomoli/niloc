"""
Build fabrication pipeline presentation PDF.
Run from project root:  uv run python outputs/presentation/build_pdf.py
Output: outputs/presentation/fabrication_pipeline_demo.pdf
"""
from pathlib import Path
import textwrap

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.gridspec import GridSpec
import matplotlib.image as mpimg

# ── paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent   # niloc/
VIZ  = ROOT / "outputs" / "viz"
OUT  = ROOT / "outputs" / "presentation" / "fabrication_pipeline_demo.pdf"

IMGS = {
    "pipeline":      VIZ / "fabrication_pipeline.png",
    "trajectories":  VIZ / "trajectories_on_floorplan.png",
    "gallery":       VIZ / "noise_segment_gallery.png",
    "magnitude":     VIZ / "noise_magnitude_over_time.png",
    "dpi":           VIZ / "fabrication_drift_scale.png",
    "junction":      VIZ / "junction_smoothing.png",
    "acf":           VIZ / "noise_autocorrelation.png",
    "fab_traj":      ROOT / "outputs" / "fabricated" / "avalon_2nd_floor" / "trajectory_summary.png",
}

# ── design tokens ──────────────────────────────────────────────────────────
BG       = "#13162a"
BG_DARK  = "#0b0d14"
BG_CARD  = "#0e1020"
ACCENT   = "#4f9cf9"
ACCENT2  = "#8b5cf6"
FG       = "#e2e6f0"
FG_DIM   = "#a0b0cc"
FG_FAINT = "#3a4468"
BORDER   = "#1e2540"

SLIDE_W, SLIDE_H = 13.33, 7.5   # inches (16:9 at 96 dpi = 1280×720)

plt.rcParams.update({
    "font.family":       "sans-serif",
    "font.sans-serif":   ["Helvetica Neue", "Arial", "DejaVu Sans"],
    "text.color":        FG,
    "axes.facecolor":    BG,
    "figure.facecolor":  BG,
    "axes.edgecolor":    BORDER,
    "axes.labelcolor":   FG_DIM,
    "xtick.color":       FG_FAINT,
    "ytick.color":       FG_FAINT,
    "savefig.facecolor": BG,
    "savefig.edgecolor": BG,
})


# ── helpers ────────────────────────────────────────────────────────────────

def new_slide():
    fig = plt.figure(figsize=(SLIDE_W, SLIDE_H))
    fig.patch.set_facecolor(BG)
    # left accent bar
    fig.add_axes([0, 0, 0.006, 1]).set_facecolor(ACCENT)
    fig.axes[-1].set_xticks([])
    fig.axes[-1].set_yticks([])
    for sp in fig.axes[-1].spines.values():
        sp.set_visible(False)
    return fig


def slide_header(fig, tag, title, y_tag=0.935, y_title=0.875):
    fig.text(0.04, y_tag,   tag,   fontsize=9,  color=ACCENT,
             fontweight="bold", transform=fig.transFigure,
             va="top", ha="left", style="normal",
             fontfamily="monospace")
    fig.text(0.04, y_title, title, fontsize=22, color=FG,
             fontweight="bold", transform=fig.transFigure,
             va="top", ha="left")
    # thin divider line
    fig.add_artist(plt.Line2D(
        [0.04, 0.97], [y_title - 0.065, y_title - 0.065],
        transform=fig.transFigure, color=BORDER, linewidth=0.8, zorder=3
    ))


def show_image(ax, path, caption=None):
    img = mpimg.imread(str(path))
    ax.imshow(img, aspect="auto")
    ax.set_xticks([])
    ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_color(BORDER)
        sp.set_linewidth(0.6)
    if caption:
        ax.set_xlabel(
            textwrap.fill(caption, width=120),
            fontsize=8, color=FG_FAINT, labelpad=5,
            wrap=True
        )


def bullet(fig, x, y, items, fontsize=12, dy=0.058):
    for i, item in enumerate(items):
        fig.text(x,      y - i * dy, "—", fontsize=fontsize,
                 color=ACCENT, transform=fig.transFigure, va="top")
        fig.text(x+0.02, y - i * dy,
                 textwrap.fill(item, width=55),
                 fontsize=fontsize, color=FG_DIM,
                 transform=fig.transFigure, va="top", linespacing=1.4)


def stat_box(ax, value, label, color=ACCENT):
    ax.set_facecolor(BG_CARD)
    for sp in ax.spines.values():
        sp.set_color(BORDER)
        sp.set_linewidth(0.8)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.text(0.5, 0.58, value, fontsize=28, fontweight="bold",
            color=color, ha="center", va="center", transform=ax.transAxes)
    ax.text(0.5, 0.22, label.upper(), fontsize=7.5, color=FG_FAINT,
            ha="center", va="center", transform=ax.transAxes,
            fontfamily="monospace")


# ══════════════════════════════════════════════════════════════════════════
#  SLIDES
# ══════════════════════════════════════════════════════════════════════════

def slide_01_title():
    fig = new_slide()

    fig.text(0.04, 0.78, "NiLoc Indoor Localization",
             fontsize=10, color=FG_FAINT, transform=fig.transFigure,
             va="top", fontfamily="monospace")
    fig.text(0.04, 0.71, "Synthetic Data\nFabrication Pipeline",
             fontsize=40, fontweight="bold", color=FG,
             transform=fig.transFigure, va="top", linespacing=1.15)

    fig.add_artist(plt.Line2D(
        [0.04, 0.15], [0.53, 0.53],
        transform=fig.transFigure, color=ACCENT, linewidth=2.5
    ))

    fig.text(0.04, 0.50,
             "Generating realistic training data by injecting\n"
             "real VIO drift onto A*-generated ground-truth paths.",
             fontsize=13, color=FG_DIM, transform=fig.transFigure, va="top",
             linespacing=1.6)

    fig.text(0.04, 0.16,
             "Avalon 2nd Floor  ·  Fabrication Sprint  ·  April 2026",
             fontsize=10, color=FG_FAINT, transform=fig.transFigure, va="top")

    # right-side big stat
    ax_stat = fig.add_axes([0.72, 0.28, 0.22, 0.32])
    ax_stat.set_facecolor(BG_CARD)
    for sp in ax_stat.spines.values():
        sp.set_color(BORDER)
    ax_stat.set_xticks([])
    ax_stat.set_yticks([])
    ax_stat.text(0.5, 0.62, "500", fontsize=56, fontweight="bold",
                 color=ACCENT, ha="center", va="center",
                 transform=ax_stat.transAxes)
    ax_stat.text(0.5, 0.22, "FABRICATED TRAJECTORIES", fontsize=8,
                 color=FG_FAINT, ha="center", va="center",
                 transform=ax_stat.transAxes, fontfamily="monospace")

    # slide number
    fig.text(0.96, 0.03, "1 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_02_motivation():
    fig = new_slide()
    slide_header(fig, "BACKGROUND", "Why fabricate training data?")

    fig.text(0.04, 0.77,
             "NiLoc maps VIO odometry tracks onto floorplan probability distributions.\n"
             "Training needs paired (VIO, GT) trajectories — expensive to record in new buildings.",
             fontsize=12, color=FG_DIM, transform=fig.transFigure,
             va="top", linespacing=1.6)

    bullet(fig, 0.04, 0.61, [
        "Real recordings require manual GT labeling in each new building",
        "Need diverse paths across the full floorplan — not just human-walked corridors",
        "VIO noise characteristics should transfer across buildings if scaled correctly",
        "Fabrication lets us generate hundreds of trajectories in minutes",
    ], fontsize=12)

    # strategy box (right side)
    box = fig.add_axes([0.62, 0.17, 0.35, 0.58])
    box.set_facecolor(BG_CARD)
    for sp in box.spines.values():
        sp.set_color(BORDER)
    box.set_xticks([])
    box.set_yticks([])

    steps = [
        (ACCENT,  "1.", "Generate ideal paths\non any floorplan via A*"),
        (ACCENT,  "2.", "Extract real VIO noise\nfrom existing recordings"),
        (ACCENT2, "3.", "Inject noise onto\nsynthetic paths"),
    ]
    for i, (col, num, text) in enumerate(steps):
        y = 0.78 - i * 0.29
        box.text(0.08, y, num, fontsize=18, fontweight="bold",
                 color=col, va="top", transform=box.transAxes)
        box.text(0.22, y, text, fontsize=11, color=FG_DIM,
                 va="top", transform=box.transAxes, linespacing=1.4)
        if i < 2:
            box.axhline(y - 0.23, xmin=0.06, xmax=0.94,
                        color=BORDER, linewidth=0.6)

    fig.text(0.96, 0.03, "2 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_03_overview():
    fig = new_slide()
    slide_header(fig, "OVERVIEW", "Four-stage fabrication pipeline")

    step_data = [
        ("STEP 1", "A* Path\nGeneration",
         "Collision-free paths on\nfloorplan + B-spline\njunction smoothing.",
         "astar.py\nlauncher.py\nsmooth_trajectory.py",
         ACCENT, BG_CARD),
        ("STEP 2", "Noise\nLibrary",
         "Sliding-window VIO drift\nsegments from real\nuniversityA recordings.",
         "build_noise_library.py\nnoise_library.npy",
         ACCENT, "#161c36"),
        ("STEP 3", "Noise\nInjection",
         "Sample + concatenate\nsegments. DPI-scale to\ntarget building.",
         "inject_noise.py\naug_mult=5\nDPI scaling",
         ACCENT, BG_CARD),
        ("OUTPUT", "Formatted\nDataset",
         "500 .txt files:\nts, x, y, gt_x, gt_y\nBuilt-in validation.",
         "format_output.py\n500 trajectories",
         ACCENT2, "#17132a"),
    ]

    left = 0.04
    box_w = 0.205
    gap = 0.01
    arrow_w = 0.025
    top = 0.76
    box_h = 0.52

    for i, (tag, title, body, code, col, bg) in enumerate(step_data):
        xl = left + i * (box_w + gap + arrow_w)

        # arrow before (not first)
        if i > 0:
            xa = xl - arrow_w - gap + gap * 0.5
            fig.text(xa + arrow_w * 0.5, top - box_h * 0.5,
                     "›", fontsize=24, color=BORDER,
                     transform=fig.transFigure, ha="center", va="center")

        ax = fig.add_axes([xl, top - box_h, box_w, box_h])
        ax.set_facecolor(bg)
        for sp in ax.spines.values():
            sp.set_color(col if col == ACCENT2 else BORDER)
            sp.set_linewidth(1.0 if col == ACCENT2 else 0.8)
        ax.set_xticks([])
        ax.set_yticks([])

        ax.text(0.5, 0.95, tag, fontsize=8, fontweight="bold",
                color=col, ha="center", va="top",
                transform=ax.transAxes, fontfamily="monospace")
        ax.text(0.5, 0.80, title, fontsize=13, fontweight="bold",
                color=FG, ha="center", va="top",
                transform=ax.transAxes, linespacing=1.3)
        ax.axhline(0.63, xmin=0.05, xmax=0.95, color=BORDER, linewidth=0.6)
        ax.text(0.5, 0.58, body, fontsize=9.5, color=FG_DIM,
                ha="center", va="top",
                transform=ax.transAxes, linespacing=1.5)
        ax.axhline(0.28, xmin=0.05, xmax=0.95, color=BORDER, linewidth=0.4)
        ax.text(0.5, 0.23, code, fontsize=8, color=FG_FAINT,
                ha="center", va="top",
                transform=ax.transAxes, linespacing=1.5,
                fontfamily="monospace")

    fig.text(0.04, 0.16,
             "Entry point: preprocess/synthetic_data/fabricate.py   ·   "
             "Config: configs/fabricate_avalon.yaml",
             fontsize=9, color=FG_FAINT, transform=fig.transFigure, va="top",
             fontfamily="monospace")

    fig.text(0.96, 0.03, "3 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_04_real_data():
    fig = new_slide()
    slide_header(fig, "STEP 2 — NOISE SOURCE", "Real VIO recordings (universityA)")

    ax_img = fig.add_axes([0.04, 0.13, 0.44, 0.68])
    show_image(ax_img, IMGS["trajectories"],
               "universityA floorplan — solid = GT,  dashed = VIO.  "
               "Drift grows with distance from last reset point.")

    stats = [
        ("2,924", "noise segments"),
        ("150",   "frames / segment"),
        ("2.5",   "px/m  source DPI"),
    ]
    for i, (val, lbl) in enumerate(stats):
        ax = fig.add_axes([0.55, 0.62 - i * 0.195, 0.38, 0.155])
        stat_box(ax, val, lbl, ACCENT if i < 2 else ACCENT2)

    fig.text(0.55, 0.37,
             "Noise is extracted as the per-frame offset\n"
             "between VIO and optical GT:\n"
             "  noise = (x_vio − x_gt,  y_vio − y_gt)\n\n"
             "Segments normalized to start at (0, 0)\n"
             "so they apply to any path position.",
             fontsize=11, color=FG_DIM, transform=fig.transFigure,
             va="top", linespacing=1.6, fontfamily="monospace")

    fig.text(0.96, 0.03, "4 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_05_gallery():
    fig = new_slide()
    slide_header(fig, "STEP 2 — NOISE LIBRARY", "Extracted VIO drift segments")

    ax = fig.add_axes([0.04, 0.13, 0.92, 0.67])
    show_image(ax, IMGS["gallery"],
               "Left: drift magnitude (px) over 150-frame windows — 20 random segments from 2,924 total.   "
               "Right: 2-D drift paths normalized to origin. Segments capture the shape of VIO error, "
               "not just magnitude, and are position-agnostic.")

    fig.text(0.96, 0.03, "5 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_06_acf():
    fig = new_slide()
    slide_header(fig, "STEP 2 — NOISE CHARACTERIZATION",
                 "VIO noise is temporally correlated (random-walk)")

    ax_img = fig.add_axes([0.04, 0.13, 0.54, 0.66])
    show_image(ax_img, IMGS["acf"],
               "ACF stays above 0.5 until lag ~60–66 frames — confirms drift is a random walk, "
               "not i.i.d. noise.")

    fig.text(0.64, 0.77,
             "Why this matters",
             fontsize=13, fontweight="bold", color=FG,
             transform=fig.transFigure, va="top")

    bullet(fig, 0.64, 0.70, [
        "Naive Gaussian noise injection\nwould be unrealistic",
        "Pipeline samples contiguous\nsegments (not individual frames)",
        "Segments concatenated to match\npath length",
        "Loop closure: segments can reverse\ndirection mid-trajectory",
    ], fontsize=11, dy=0.115)

    fig.text(0.96, 0.03, "6 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_07_astar():
    fig = new_slide()
    slide_header(fig, "STEP 1 — GROUND TRUTH PATHS",
                 "A* pathfinding on Avalon 2nd floor")

    ax_img = fig.add_axes([0.38, 0.13, 0.59, 0.66])
    show_image(ax_img, IMGS["dpi"],
               "Left: incorrect DPI=3.5 assumption from sprint planning.  "
               "Right: corrected DPI=4.00 (Ana, commit 260a09a).  "
               "GT path shape unchanged — only noise scale is affected.")

    bullet(fig, 0.04, 0.74, [
        "A* finds collision-free paths between\nrandom start/goal pairs on walkable space",
        "Minimum path length: 400 frames",
        "28 clean GT paths generated\nfor Avalon 2nd floor",
        "B-spline smoothing applied\nafter pathfinding",
        "Paths are coordinates only — no\nsensor simulation needed",
    ], fontsize=11, dy=0.115)

    ax_stat = fig.add_axes([0.04, 0.14, 0.28, 0.12])
    ax_stat.set_facecolor(BG_CARD)
    for sp in ax_stat.spines.values():
        sp.set_color(BORDER)
    ax_stat.set_xticks([])
    ax_stat.set_yticks([])
    ax_stat.text(0.06, 0.55, "28 GT paths  ×  aug_mult 5",
                 fontsize=10, color=FG_DIM, va="center",
                 transform=ax_stat.transAxes)
    ax_stat.text(0.06, 0.18, "= 140+ distinct trajectories per noise run",
                 fontsize=9, color=ACCENT2, va="center",
                 transform=ax_stat.transAxes, fontweight="bold")

    fig.text(0.96, 0.03, "7 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_08_junction():
    fig = new_slide()
    slide_header(fig, "STEP 1 — PATH QUALITY",
                 "Junction smoothing for uniform step size")

    ax = fig.add_axes([0.04, 0.13, 0.92, 0.67])
    show_image(ax, IMGS["junction"],
               "Left: raw A* path has sharp 90° turns (orange dots = detected junctions); "
               "B-spline smoothing converts corners to curves.   "
               "Right: step size (px/frame) is near-constant after smoothing — "
               "spikes at junctions eliminated.  Prevents the model from learning "
               "artifacts from instantaneous direction reversals.")

    fig.text(0.96, 0.03, "8 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_09_magnitude():
    fig = new_slide()
    slide_header(fig, "STEP 3 — NOISE INJECTION",
                 "Drift magnitude over time in fabricated output")

    ax = fig.add_axes([0.04, 0.13, 0.92, 0.67])
    show_image(ax, IMGS["magnitude"],
               "Top: VIO drift magnitude (px) for 20 fabricated trajectories over 2,000+ frames — "
               "oscillates as noise segments are concatenated (mimics loop-closure resets).  "
               "Global mean: 73 px.   "
               "Bottom: distribution of final-frame drift across 100 training trajectories — mean 23 px.")

    fig.text(0.96, 0.03, "9 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_10_results():
    fig = new_slide()
    slide_header(fig, "RESULTS", "Fabricated dataset — Avalon 2nd floor")

    ax = fig.add_axes([0.04, 0.13, 0.92, 0.67])
    show_image(ax, IMGS["pipeline"],
               "Left: 27 A*-generated GT paths on Avalon floorplan.   "
               "Centre: drift magnitude per session — open-loop vs loop-closure; noise scale 4×; mean drift 15.9 m.   "
               "Right: histogram of mean drift per trajectory for 81 fabricated examples — mean 15.9 m.")

    fig.text(0.96, 0.03, "10 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_11_summary():
    fig = new_slide()
    slide_header(fig, "SUMMARY", "Dataset statistics & next steps")

    # stat grid
    stats_left = [
        ("500",    "trajectories",       ACCENT),
        ("38 K",   "total frames",       ACCENT),
        ("15.6 m", "mean drift",         ACCENT2),
        ("28",     "GT paths (A*)",      ACCENT),
        ("2,924",  "noise segments",     ACCENT),
        ("10.0",   "px/m  target DPI",   ACCENT),
    ]
    cols = 3
    ax_w, ax_h = 0.19, 0.18
    x0, y0 = 0.04, 0.73
    x_gap, y_gap = 0.01, 0.02

    for i, (val, lbl, col) in enumerate(stats_left):
        row, col_i = divmod(i, cols)
        xpos = x0 + col_i * (ax_w + x_gap)
        ypos = y0 - row * (ax_h + y_gap) - ax_h
        ax = fig.add_axes([xpos, ypos, ax_w, ax_h])
        stat_box(ax, val, lbl, col)

    # next steps
    fig.text(0.68, 0.78, "Next steps", fontsize=13,
             fontweight="bold", color=FG,
             transform=fig.transFigure, va="top")

    bullet(fig, 0.68, 0.71, [
        "Train NiLoc on fabricated Avalon\ndataset and evaluate localization",
        "Expand pipeline to additional\nfloors and buildings",
        "Validate fabricated noise statistics\nagainst real Avalon VIO drift",
        "Tune aug_mult and segment\nlength for best coverage",
    ], fontsize=11, dy=0.125)

    fig.text(0.96, 0.03, "11 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_12_vio_problem():
    fig = new_slide()
    slide_header(fig, "THE PROBLEM", "Why raw IMU is not enough")

    ax_img = fig.add_axes([0.04, 0.13, 0.55, 0.66])
    show_image(ax_img, IMGS["fab_traj"],
               "Blue = raw VIO dead-reckoning on fabricated Avalon paths.  "
               "Purple = ground truth.  Paths start at the same point — divergence is pure IMU drift.")

    fig.text(0.65, 0.80, "What you are seeing", fontsize=13,
             fontweight="bold", color=FG,
             transform=fig.transFigure, va="top")

    fig.text(0.65, 0.73,
             "Integrating the phone's accelerometer\n"
             "and gyroscope naively produces a path\n"
             "that wanders off the building entirely\n"
             "within seconds.",
             fontsize=11, color=FG_DIM, transform=fig.transFigure,
             va="top", linespacing=1.6)

    fig.add_artist(plt.Line2D(
        [0.65, 0.96], [0.56, 0.56],
        transform=fig.transFigure, color=BORDER, linewidth=0.6
    ))

    fig.text(0.65, 0.53, "What the model will do", fontsize=13,
             fontweight="bold", color=FG,
             transform=fig.transFigure, va="top")

    bullet(fig, 0.65, 0.46, [
        "Take the drifting blue path as input",
        "Match it against the floorplan grid",
        "Output a corrected probability\ndistribution over walkable space",
        "Blue path snaps back to purple",
    ], fontsize=11, dy=0.10)

    fig.text(0.96, 0.03, "12 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


def slide_13_training():
    fig = new_slide()
    slide_header(fig, "TRAINING — LIVE", "Avalon model training in progress")

    # Loss progress bar visual
    ax_bar = fig.add_axes([0.04, 0.62, 0.55, 0.16])
    ax_bar.set_facecolor(BG_CARD)
    for sp in ax_bar.spines.values():
        sp.set_color(BORDER)
        sp.set_linewidth(0.8)
    ax_bar.set_xlim(0, 800)
    ax_bar.set_ylim(0, 1)
    ax_bar.set_yticks([])
    ax_bar.set_xticks([0, 200, 400, 600, 800])
    ax_bar.tick_params(colors=FG_FAINT, labelsize=8)
    ax_bar.set_xlabel("epoch", fontsize=9, color=FG_FAINT, labelpad=4)
    # background track
    ax_bar.axhspan(0.3, 0.7, xmin=0, xmax=1, color=FG_FAINT, alpha=0.08)
    # progress fill
    progress = 21 / 800
    ax_bar.axhspan(0.3, 0.7, xmin=0, xmax=progress, color=ACCENT, alpha=0.6)
    ax_bar.text(21 + 8, 0.5, "epoch 21", fontsize=9, color=ACCENT,
                va="center", transform=ax_bar.get_xaxis_transform())
    ax_bar.text(780, 0.5, "800", fontsize=9, color=FG_FAINT,
                va="center", ha="right", transform=ax_bar.get_xaxis_transform())

    # Loss stat boxes
    stats = [
        ("11.3", "initial loss  (epoch 0)", ACCENT2),
        ("9.1",  "current loss  (epoch 21)", ACCENT),
        ("~2.6%", "epochs complete", FG_DIM),
    ]
    for i, (val, lbl, col) in enumerate(stats):
        ax = fig.add_axes([0.04 + i * 0.195, 0.38, 0.17, 0.19])
        stat_box(ax, val, lbl, col)

    fig.text(0.04, 0.31,
             "Loss has dropped 19% in the first 21 epochs — model is learning the Avalon floorplan structure.",
             fontsize=10, color=FG_DIM, transform=fig.transFigure, va="top",
             linespacing=1.5)

    fig.add_artist(plt.Line2D(
        [0.65, 0.96], [0.85, 0.85],
        transform=fig.transFigure, color=BORDER, linewidth=0.6
    ))

    fig.text(0.65, 0.82, "What convergence will unlock",
             fontsize=13, fontweight="bold", color=FG,
             transform=fig.transFigure, va="top")

    bullet(fig, 0.65, 0.74, [
        "Inference on real Avalon 2nd floor\nwalks — no GT labeling needed",
        "Evaluate: does fabricated training\ntransfer to real sensor data?",
        "Baseline for real vs synthetic\ndata quality comparison",
        "Extend to additional Avalon floors\nusing the same pipeline",
    ], fontsize=11, dy=0.115)

    fig.text(0.65, 0.18,
             "Training: Ana  ·  RTX 4060  ·  ~70 s/epoch  ·  ~15 h total",
             fontsize=9, color=FG_FAINT, transform=fig.transFigure,
             va="top", fontfamily="monospace")

    fig.text(0.96, 0.03, "13 / 13", fontsize=8, color=FG_FAINT,
             transform=fig.transFigure, va="bottom", ha="right")
    return fig


# ── assemble PDF ────────────────────────────────────────────────────────────

slide_fns = [
    slide_01_title,
    slide_02_motivation,
    slide_03_overview,
    slide_04_real_data,
    slide_05_gallery,
    slide_06_acf,
    slide_07_astar,
    slide_08_junction,
    slide_09_magnitude,
    slide_10_results,
    slide_11_summary,
    slide_12_vio_problem,
    slide_13_training,
]

print(f"Building {len(slide_fns)}-slide PDF...")
with PdfPages(str(OUT)) as pdf:
    for i, fn in enumerate(slide_fns, 1):
        print(f"  slide {i:2d} / {len(slide_fns)} — {fn.__name__}")
        fig = fn()
        pdf.savefig(fig, bbox_inches="tight", facecolor=BG, dpi=150)
        plt.close(fig)

print(f"\nSaved: {OUT}")
