"""
Issue #28 — DXF-derived walkability mask and vector overlay for Avalon 2nd floor.

Reads `preprocess/data/dxf files/2nd floor.dxf`, extracts wall geometry from
the partition layers, rasterises it to a binary (IMG_ROWS, IMG_COLS) walkability
mask, and produces a vector overlay image of the DXF lines on the floorplan.

Outputs (all written to niloc/data/avalon/):
  walkability_mask_dxf.npy   boolean (221, 411) mask — True = walkable
  dxf_overlay.png            DXF wall lines rendered at floorplan resolution

The DXF coordinate system (inches, CAD origin) is mapped to floorplan pixels
using the wall-layer bounding box centroid as the anchor, with the same 10°
building rotation established in issue #15.

Usage
-----
    uv run python -m preprocess.synthetic_data.build_dxf_mask
    uv run python -m preprocess.synthetic_data.build_dxf_mask --compare
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

_LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
DXF_PATH = REPO_ROOT / "preprocess/data/dxf files/2nd floor.dxf"
OUT_DIR = REPO_ROOT / "niloc/data/avalon"
OUT_MASK = OUT_DIR / "walkability_mask_dxf.npy"
OUT_OVERLAY = OUT_DIR / "dxf_overlay.png"

IMG_ROWS = 221
IMG_COLS = 411

# DXF units are inches; 1 inch = 0.0254 m.
IN_TO_M = 0.0254

# Building rotation (east of north) — established in issue #15.
BUILDING_ROTATION_DEG = 10.0

# Wall layers to rasterise for the walkability mask.
# NEW_PART = interior partitions, BASE_PART = perimeter/base walls,
# A-WALL-PATT-LITE = wall fill pattern lines (thickens walls visually).
WALL_LAYERS = {
    "x-BASE$0$NEW_PART",
    "x-BASE$0$BASE_PART",
    "x-BASE$0$A-WALL-PATT-LITE",
}

# Layers to draw in the vector overlay (superset of wall layers — adds
# glazing, stairs, and doors for context).
OVERLAY_LAYERS = WALL_LAYERS | {
    "x-BASE$0$NEW_PART_GLAZ",
    "x-BASE$0$BASE_GLAZ",
    "x-BASE$0$BASE_STAIRS",
}

OVERLAY_LAYER_STYLE = {
    "x-BASE$0$NEW_PART":       dict(color="magenta",  lw=1.0, alpha=1.0),
    "x-BASE$0$BASE_PART":      dict(color="magenta",  lw=1.2, alpha=1.0),
    "x-BASE$0$A-WALL-PATT-LITE": dict(color="magenta", lw=0.4, alpha=0.5),
    "x-BASE$0$NEW_PART_GLAZ":  dict(color="cyan",     lw=0.6, alpha=0.7),
    "x-BASE$0$BASE_GLAZ":      dict(color="cyan",     lw=0.6, alpha=0.7),
    "x-BASE$0$BASE_STAIRS":    dict(color="white",    lw=0.5, alpha=0.6),
}


# ---------------------------------------------------------------------------
# DXF → pixel transform
# ---------------------------------------------------------------------------

def _build_dxf_transform(
    xs: list[float], ys: list[float]
) -> dict:
    """
    Derive a transform from DXF (inches, CAD frame) to floorplan pixels.

    The DXF is a local CAD coordinate system — NOT geographically oriented.
    The building long axis is already along DXF-X, which maps directly to the
    floorplan col direction (both are the long axis). No geographic rotation is
    applied here; the 10° building rotation only belongs in the GPS transform.

    Mapping:
        DXF-X  (long axis)  →  col   (+X = +col, rightward)
        DXF-Y  (short axis) →  row   (+Y = -row, because CAD Y-up vs image row-down)

    Anchor: bounding-box centroid of wall vertices → floorplan image centre.
    Scale: separate X and Y factors derived from bounding box vs image size.
    """
    dxf_cx = (min(xs) + max(xs)) / 2.0
    dxf_cy = (min(ys) + max(ys)) / 2.0

    px_cx = (IMG_COLS - 1) / 2.0
    px_cy = (IMG_ROWS - 1) / 2.0

    width_in  = max(xs) - min(xs)   # DXF X extent (inches) → cols
    height_in = max(ys) - min(ys)   # DXF Y extent (inches) → rows

    scale_x = IMG_COLS / width_in   # px / DXF-inch  (col direction)
    scale_y = IMG_ROWS / height_in  # px / DXF-inch  (row direction)

    _LOG.info(
        "DXF extents: %.2fm × %.2fm  |  scale_x=%.4f px/in (%.2f px/m)  "
        "scale_y=%.4f px/in (%.2f px/m)",
        width_in * IN_TO_M, height_in * IN_TO_M,
        scale_x, scale_x / IN_TO_M,
        scale_y, scale_y / IN_TO_M,
    )

    return dict(
        dxf_cx=dxf_cx, dxf_cy=dxf_cy,
        px_cx=px_cx,   px_cy=px_cy,
        scale_x=scale_x, scale_y=scale_y,
    )


def dxf_to_pixel(
    x: float, y: float, t: dict
) -> tuple[float, float]:
    """
    Convert a DXF (x, y) in inches to (row, col) floorplan pixel coordinates.

    DXF-X → col (same direction).
    DXF-Y → row, negated (CAD Y-up convention vs image row-down convention).
    """
    col = t["px_cx"] + (x - t["dxf_cx"]) * t["scale_x"]
    row = t["px_cy"] - (y - t["dxf_cy"]) * t["scale_y"]
    return row, col


# ---------------------------------------------------------------------------
# Geometry extraction
# ---------------------------------------------------------------------------

def _collect_segments(
    msp, layers: set[str]
) -> list[tuple[float, float, float, float]]:
    """
    Return all (x0, y0, x1, y1) line segments from the given DXF layers.

    Handles LINE and LWPOLYLINE entity types.
    """
    segments: list[tuple[float, float, float, float]] = []
    for e in msp:
        if e.dxf.layer not in layers:
            continue
        t = e.dxftype()
        if t == "LINE":
            segments.append((
                e.dxf.start.x, e.dxf.start.y,
                e.dxf.end.x,   e.dxf.end.y,
            ))
        elif t == "LWPOLYLINE":
            pts = list(e.get_points())
            for a, b in zip(pts, pts[1:]):
                segments.append((a[0], a[1], b[0], b[1]))
            if e.closed and len(pts) > 1:
                segments.append((pts[-1][0], pts[-1][1], pts[0][0], pts[0][1]))
    return segments


# ---------------------------------------------------------------------------
# Rasterisation
# ---------------------------------------------------------------------------

def _rasterise_segments(
    segments: list[tuple[float, float, float, float]],
    transform: dict,
    thickness_px: int = 1,
) -> np.ndarray:
    """
    Rasterise wall segments onto a boolean (IMG_ROWS, IMG_COLS) grid.

    Pixels on or within `thickness_px` of any wall segment are marked as
    walls (False in the walkability mask).
    """
    wall_mask = np.zeros((IMG_ROWS, IMG_COLS), dtype=bool)

    for x0, y0, x1, y1 in segments:
        r0, c0 = dxf_to_pixel(x0, y0, transform)
        r1, c1 = dxf_to_pixel(x1, y1, transform)

        ri0, ci0 = int(round(r0)), int(round(c0))
        ri1, ci1 = int(round(r1)), int(round(c1))

        # Bresenham line rasterisation
        for r, c in _bresenham(ri0, ci0, ri1, ci1):
            for dr in range(-thickness_px, thickness_px + 1):
                for dc in range(-thickness_px, thickness_px + 1):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < IMG_ROWS and 0 <= cc < IMG_COLS:
                        wall_mask[rr, cc] = True

    return wall_mask


def _bresenham(
    r0: int, c0: int, r1: int, c1: int
) -> list[tuple[int, int]]:
    """Yield all (row, col) cells on the Bresenham line from (r0,c0) to (r1,c1)."""
    cells: list[tuple[int, int]] = []
    dr, dc = abs(r1 - r0), abs(c1 - c0)
    sr, sc = (1 if r0 < r1 else -1), (1 if c0 < c1 else -1)
    err = dr - dc
    r, c = r0, c0
    while True:
        cells.append((r, c))
        if r == r1 and c == c1:
            break
        e2 = 2 * err
        if e2 > -dc:
            err -= dc
            r += sr
        if e2 < dr:
            err += dr
            c += sc
    return cells


# ---------------------------------------------------------------------------
# Overlay rendering
# ---------------------------------------------------------------------------

def _render_overlay(
    segments_by_layer: dict[str, list[tuple]],
    transform: dict,
    walkability_mask: np.ndarray,
    out_path: Path,
) -> None:
    """Render DXF wall lines over a dark background at floorplan resolution."""
    fig, ax = plt.subplots(figsize=(12, 7), facecolor="black")
    ax.set_facecolor("black")

    # Walkable area as dark grey background
    bg = np.where(walkability_mask, 40, 0).astype(np.uint8)
    ax.imshow(
        np.stack([bg] * 3, axis=-1),
        origin="upper", aspect="auto",
        extent=[0, IMG_COLS, IMG_ROWS, 0],
    )

    for layer, segs in segments_by_layer.items():
        style = OVERLAY_LAYER_STYLE.get(layer, dict(color="white", lw=0.5, alpha=0.5))
        for x0, y0, x1, y1 in segs:
            r0, c0 = dxf_to_pixel(x0, y0, transform)
            r1, c1 = dxf_to_pixel(x1, y1, transform)
            ax.plot([c0, c1], [r0, r1], **style)

    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title("Avalon 2nd floor — DXF wall overlay", color="white")
    ax.tick_params(colors="white")
    for spine in ax.spines.values():
        spine.set_edgecolor("white")

    fig.tight_layout()
    fig.savefig(out_path, dpi=200, facecolor="black")
    plt.close(fig)
    _LOG.info("DXF overlay saved → %s", out_path)


def _render_comparison(
    walkability_dxf: np.ndarray,
    out_path: Path,
) -> None:
    """Side-by-side comparison: DXF mask vs existing density mask."""
    density_path = REPO_ROOT / "niloc/data/avalon/floorplan.png.npy"
    density = np.load(density_path) > 0

    fig, axes = plt.subplots(1, 2, figsize=(18, 6))
    axes[0].imshow(density, cmap="gray", origin="upper", aspect="auto")
    axes[0].set_title(
        f"Density-based mask  ({density.sum()} walkable px / {density.size} total)"
    )
    axes[1].imshow(walkability_dxf, cmap="gray", origin="upper", aspect="auto")
    axes[1].set_title(
        f"DXF-derived mask  ({walkability_dxf.sum()} walkable px / {walkability_dxf.size} total)"
    )
    fig.suptitle("Walkability mask comparison", fontsize=12)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    _LOG.info("Comparison saved → %s", out_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(compare: bool = False) -> None:
    import ezdxf

    _LOG.info("Loading DXF: %s", DXF_PATH)
    doc = ezdxf.readfile(str(DXF_PATH))
    msp = doc.modelspace()

    # Collect wall segments for mask + extents
    wall_segs = _collect_segments(msp, WALL_LAYERS)
    _LOG.info("Wall segments: %d", len(wall_segs))

    xs = [x for s in wall_segs for x in (s[0], s[2])]
    ys = [y for s in wall_segs for y in (s[1], s[3])]
    transform = _build_dxf_transform(xs, ys)

    # Collect all overlay segments
    overlay_segs: dict[str, list] = {layer: [] for layer in OVERLAY_LAYERS}
    for e in msp:
        if e.dxf.layer not in OVERLAY_LAYERS:
            continue
        t = e.dxftype()
        if t == "LINE":
            overlay_segs[e.dxf.layer].append((
                e.dxf.start.x, e.dxf.start.y,
                e.dxf.end.x,   e.dxf.end.y,
            ))
        elif t == "LWPOLYLINE":
            pts = list(e.get_points())
            for a, b in zip(pts, pts[1:]):
                overlay_segs[e.dxf.layer].append((a[0], a[1], b[0], b[1]))

    # Rasterise walls
    _LOG.info("Rasterising wall geometry ...")
    wall_raster = _rasterise_segments(wall_segs, transform, thickness_px=1)
    walkability = ~wall_raster  # walkable = not a wall

    frac = walkability.mean()
    _LOG.info(
        "DXF mask: %d walkable / %d total pixels (%.1f%%)",
        walkability.sum(), walkability.size, frac * 100,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.save(OUT_MASK, walkability)
    _LOG.info("Mask saved → %s", OUT_MASK)

    _render_overlay(overlay_segs, transform, walkability, OUT_OVERLAY)

    if compare:
        _render_comparison(walkability, OUT_DIR / "mask_comparison.png")

    print(
        f"\nDXF mask: {walkability.sum()} walkable pixels "
        f"({frac*100:.1f}% of floor)\n"
        f"Saved → {OUT_MASK}\n"
        f"Overlay → {OUT_OVERLAY}"
    )


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Build DXF-derived walkability mask for Avalon 2nd floor (issue #28)."
    )
    parser.add_argument(
        "--compare", action="store_true",
        help="Also save a side-by-side comparison with the density-based mask.",
    )
    args = parser.parse_args(argv)
    run(compare=args.compare)
    return 0


if __name__ == "__main__":
    sys.exit(main())
