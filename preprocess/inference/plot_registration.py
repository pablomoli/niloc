"""
Plot the Avalon floorplan with grid coordinates labeled alongside each
VIO path from the 4 real recording sessions. Output lets the user identify
where each session starts/ends on the floorplan so GT coordinates can be set.
"""
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FLOORPLAN = ROOT / "niloc/data/avalon/floorplan.png"
SESSIONS_DIR = ROOT / "outputs/niloc_input_1hz"
SESSIONS = [
    "session_2026-03-31_16-30-20_resnet",
    "session_2026-03-31_16-31-49_resnet",
    "session_2026-03-31_16-32-08_resnet",
    "session_2026-03-31_16-34-34_resnet",
]
SHORT_NAMES = ["16:30 (480s)", "16:31 (133s)", "16:32 (485s)", "16:34 (84s)"]

# Grid config matching avalon_2nd_floor.yaml
GRID_W, GRID_H = 411, 221   # grid cells (x=cols across, y=rows down)
DPI = 10                     # pixels per metre

floorplan = plt.imread(FLOORPLAN)
fp_h, fp_w = floorplan.shape[:2]

fig = plt.figure(figsize=(22, 16))
fig.patch.set_facecolor("#1a1a2e")

gs = gridspec.GridSpec(3, 3, figure=fig, wspace=0.4, hspace=0.45,
                       height_ratios=[1.6, 1, 1])

# ── top row: annotated floorplan spanning all 3 columns ─────────────────────
ax_fp = fig.add_subplot(gs[0, :])
ax_fp.imshow(floorplan, extent=[0, GRID_W, GRID_H, 0], cmap="gray")
ax_fp.set_title("Avalon 2nd floor — grid coordinates\n(give me an (x, y) from this plot)",
                color="white", fontsize=11, pad=8)
ax_fp.set_xlabel("grid x  (0 = left edge)", color="#aaaacc", fontsize=9)
ax_fp.set_ylabel("grid y  (0 = top edge)", color="#aaaacc", fontsize=9)
ax_fp.tick_params(colors="white")
ax_fp.xaxis.label.set_color("white")
for spine in ax_fp.spines.values():
    spine.set_edgecolor("#444466")

# draw a subtle grid every 50 cells so coordinates are easy to read
for xg in range(0, GRID_W + 1, 50):
    ax_fp.axvline(xg, color="#334466", lw=0.4, alpha=0.7)
    ax_fp.text(xg, -4, str(xg), color="#88aacc", fontsize=7, ha="center")
for yg in range(0, GRID_H + 1, 50):
    ax_fp.axhline(yg, color="#334466", lw=0.4, alpha=0.7)
    ax_fp.text(-8, yg, str(yg), color="#88aacc", fontsize=7, va="center", ha="right")

ax_fp.set_xlim(-15, GRID_W + 5)
ax_fp.set_ylim(GRID_H + 5, -15)
ax_fp.set_facecolor("#0d0d1a")

# ── bottom 2 rows: one panel per session ────────────────────────────────────
axes = [
    fig.add_subplot(gs[1, 0]),
    fig.add_subplot(gs[1, 1]),
    fig.add_subplot(gs[1, 2]),
    fig.add_subplot(gs[2, 0]),
]

colors = ["#00d4ff", "#ff6b9d", "#7fff7f", "#ffcc44"]

for ax, name, short, color in zip(axes, SESSIONS, SHORT_NAMES, colors):
    data = np.loadtxt(SESSIONS_DIR / f"{name}.txt")
    vio_x = data[:, 1]
    vio_y = data[:, 2]

    ax.set_facecolor("#0d0d1a")
    ax.plot(vio_y, vio_x, color=color, lw=1.2, alpha=0.85)
    ax.scatter([vio_y[0]], [vio_x[0]], color="lime",   s=60, zorder=5, label="start")
    ax.scatter([vio_y[-1]], [vio_x[-1]], color="red",  s=60, zorder=5, label="end")

    ax.set_title(short, color=color, fontsize=10, pad=5)
    ax.set_xlabel("VIO y (m)", color="#aaaacc", fontsize=8)
    ax.set_ylabel("VIO x (m)", color="#aaaacc", fontsize=8)
    ax.tick_params(colors="white", labelsize=7)
    for spine in ax.spines.values():
        spine.set_edgecolor("#444466")
    ax.legend(fontsize=7, facecolor="#1a1a2e", edgecolor="#444466",
              labelcolor="white", markerscale=0.8)

fig.suptitle(
    "Match the VIO path shapes (right) to the floorplan (left)\n"
    "Tell me the start (green dot) grid (x, y) for each session",
    color="white", fontsize=13, y=0.98
)

out = ROOT / "outputs/viz/registration_helper.png"
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, dpi=130, bbox_inches="tight", facecolor=fig.get_facecolor())
plt.close(fig)
print(f"Saved: {out}")
