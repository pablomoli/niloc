"""
Transform tuning helper for issue #15.

Projects the IMDF Level-2 polygon boundary and navigable nodes onto the
Avalon floorplan using a rotated GPS->pixel transform. Adjust --rotation
until the cyan polygon outline matches the white building boundary.

Usage
-----
    # Preview grid of candidate angles
    uv run python -m preprocess.synthetic_data.tune_transform --grid

    # Inspect a specific angle
    uv run python -m preprocess.synthetic_data.tune_transform --rotation 7.0
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np

IMDF_DIR = (
    Path.home()
    / "Developer/MappingForMassesMobile/MappingForMasses/IMDF/IMDFAvalon"
)
REPO_ROOT = Path(__file__).resolve().parents[2]
_FP_CANDIDATES = [
    REPO_ROOT / "detailed_floorplan.jpg",
    REPO_ROOT / "niloc/data/avalon/floorplan.png",
]
FLOORPLAN = next((p for p in _FP_CANDIDATES if p.exists()), _FP_CANDIDATES[-1])
OUT_DIR = Path(__file__).parent / "data"
LEVEL2_ID = "381a4b7d-b3bb-4679-af88-db44669c88ad"
IMG_ROWS, IMG_COLS, DPI = 221, 411, 10


def _load_data():
    with open(IMDF_DIR / "navigable_points.geojson") as f:
        pts = json.load(f)
    l2 = [
        feat for feat in pts["features"]
        if feat["properties"]["level_id"] == LEVEL2_ID
    ]
    lons = [f["geometry"]["coordinates"][0] for f in l2]
    lats = [f["geometry"]["coordinates"][1] for f in l2]

    with open(IMDF_DIR / "level.geojson") as f:
        levels = json.load(f)
    poly_coords = None
    for feat in levels["features"]:
        if feat["id"] == LEVEL2_ID:
            poly_coords = feat["geometry"]["coordinates"][0]
            break

    return lons, lats, poly_coords


def build_transform(rotation_deg: float, anchor_row: float, anchor_col: float):
    """
    Return a callable (lon, lat) -> (row, col) using a rotated linear transform.

    The building long axis is `rotation_deg` east of true north, which maps
    to the image col direction (+col = +lat approximately).

    Physical steps:
        1. GPS offset -> (East metres, North metres)
        2. Rotate by -rotation_deg to align with image axes
        3. Scale by DPI
        4. Add anchor pixel
    """
    m_lat = 111_320.0
    m_lon = 111_320.0 * math.cos(math.radians(28.51))
    theta = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    # Node centroid as GPS anchor
    with open(IMDF_DIR / "navigable_points.geojson") as f:
        pts = json.load(f)
    l2 = [f for f in pts["features"] if f["properties"]["level_id"] == LEVEL2_ID]
    lons_all = [f["geometry"]["coordinates"][0] for f in l2]
    lats_all = [f["geometry"]["coordinates"][1] for f in l2]
    anchor_lon = (min(lons_all) + max(lons_all)) / 2.0
    anchor_lat = (min(lats_all) + max(lats_all)) / 2.0

    def to_px(lon: float, lat: float):
        d_E = (lon - anchor_lon) * m_lon   # metres east
        d_N = (lat - anchor_lat) * m_lat   # metres north

        # Rotate: building long axis is `rotation_deg` east of north.
        # col direction = long axis = (sin_t * E + cos_t * N)
        # row direction = short axis = (cos_t * E - sin_t * N)
        d_col_m =  sin_t * d_E + cos_t * d_N
        d_row_m =  cos_t * d_E - sin_t * d_N

        col = anchor_col + d_col_m * DPI
        row = anchor_row + d_row_m * DPI
        return row, col

    return to_px, anchor_lon, anchor_lat


def render(ax, rotation_deg: float, anchor_row: float, anchor_col: float,
           lons, lats, poly_coords, fp_img):
    to_px, *_ = build_transform(rotation_deg, anchor_row, anchor_col)

    ax.imshow(fp_img, origin="upper", aspect="equal")

    # polygon boundary
    poly_rc = [to_px(c[0], c[1]) for c in poly_coords]
    pr = [r for r, c in poly_rc] + [poly_rc[0][0]]
    pc = [c for r, c in poly_rc] + [poly_rc[0][1]]
    ax.plot(pc, pr, color="cyan", lw=2, label="IMDF boundary")

    # nodes
    nr = [to_px(lon, lat)[0] for lon, lat in zip(lons, lats)]
    nc = [to_px(lon, lat)[1] for lon, lat in zip(lons, lats)]
    ax.scatter(nc, nr, s=14, c="red", zorder=3)

    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title(f"rotation={rotation_deg:+.1f}°", fontsize=9)


def cmd_grid(lons, lats, poly_coords, fp_img):
    angles = [-5, 0, 5, 7, 10, 15, 20, 25]
    anchor_row, anchor_col = (IMG_ROWS - 1) / 2.0, (IMG_COLS - 1) / 2.0
    cols = 4
    rows = math.ceil(len(angles) / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(24, rows * 6))
    for ax, deg in zip(axes.flat, angles):
        render(ax, deg, anchor_row, anchor_col, lons, lats, poly_coords, fp_img)
    for ax in axes.flat[len(angles):]:
        ax.axis("off")
    fig.suptitle(
        "Rotation grid — find the angle where cyan boundary matches floorplan outline",
        fontsize=12,
    )
    fig.tight_layout()
    out = OUT_DIR / "rotation_grid.png"
    fig.savefig(out, dpi=130)
    plt.close(fig)
    print(f"Saved → {out}")


def cmd_single(rotation_deg: float, anchor_row: float, anchor_col: float,
               lons, lats, poly_coords, fp_img):
    fig, ax = plt.subplots(figsize=(12, 7))
    render(ax, rotation_deg, anchor_row, anchor_col, lons, lats, poly_coords, fp_img)
    ax.legend(fontsize=8)
    fig.tight_layout()
    out = OUT_DIR / f"tune_rot{rotation_deg:+.1f}.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"Saved → {out}")


def main(argv=None):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--rotation", type=float, default=None,
                        help="Building rotation in degrees east of north. "
                             "Omit to use --grid mode.")
    parser.add_argument("--grid", action="store_true",
                        help="Generate a grid of candidate angles.")
    parser.add_argument("--anchor-row", type=float, default=(IMG_ROWS - 1) / 2.0)
    parser.add_argument("--anchor-col", type=float, default=(IMG_COLS - 1) / 2.0)
    args = parser.parse_args(argv)

    fp_img = mpimg.imread(str(FLOORPLAN))
    lons, lats, poly_coords = _load_data()

    if args.grid or args.rotation is None:
        cmd_grid(lons, lats, poly_coords, fp_img)
    else:
        cmd_single(args.rotation, args.anchor_row, args.anchor_col,
                   lons, lats, poly_coords, fp_img)


if __name__ == "__main__":
    sys.exit(main())
