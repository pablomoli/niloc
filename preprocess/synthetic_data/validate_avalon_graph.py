"""
Issue #15 — Validate and extract the Avalon navigation graph from IMDF data.

Reads navigable_points.geojson / navigation_lines.geojson / graph_adjacency.json
from MappingForMassesMobile, filters to the 2nd-floor level, derives a GPS→pixel
coordinate transform, validates each node and edge against the Avalon walkability
mask, and writes the result to preprocess/synthetic_data/data/avalon_graph.json.

QA checkpoints (saved to preprocess/synthetic_data/data/):
  cp1_nodes_raw.png       nodes projected onto floorplan before any filtering
  cp2_nodes_filtered.png  nodes that survive the walkability mask test
  cp3_edges.png           edges that survive the wall-crossing test
  avalon_graph_overlay.png  final clean overlay (acceptance criterion visual)

Usage
-----
    uv run python -m preprocess.synthetic_data.validate_avalon_graph
    uv run python -m preprocess.synthetic_data.validate_avalon_graph --stop-after 1
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

_LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
IMDF_DIR = (
    Path.home()
    / "Developer/MappingForMassesMobile/MappingForMasses/IMDF/IMDFAvalon"
)
FLOORPLAN_NPY = REPO_ROOT / "niloc/data/avalon/floorplan.png"
OUT_DIR = Path(__file__).parent / "data"
OUT_GRAPH = OUT_DIR / "avalon_graph.json"

# The IMDF level_id that corresponds to Avalon 2nd floor.
LEVEL2_ID = "381a4b7d-b3bb-4679-af88-db44669c88ad"

# Floorplan dimensions (pixels) and scale — from niloc/config/grid/avalon_2nd_floor.yaml.
# Pixel coordinate convention (confirmed from plot_run.py):
#   gt_x = row  (axis 0, height = IMG_ROWS = 221)
#   gt_y = col  (axis 1, width  = IMG_COLS = 411)
IMG_ROWS = 221   # height
IMG_COLS = 411   # width
DPI = 10         # pixels per metre

# Building rotation: the Avalon 2nd floor is physically rotated ~10° east of
# true north. Without this correction the IMDF GPS nodes appear rotated on the
# floorplan. Value confirmed visually by matching the IMDF Level-2 polygon
# boundary against the floorplan outline (tune_transform.py --grid).
BUILDING_ROTATION_DEG = 10.0

# ---------------------------------------------------------------------------
# GPS → pixel transform
# ---------------------------------------------------------------------------

def _build_gps_transform(
    lons: list[float], lats: list[float]
) -> dict:
    """
    Derive a rotated GPS→pixel transform from the bounding-box centroid of the
    provided Level-2 node coordinates.

    The building long axis is BUILDING_ROTATION_DEG east of true north, which
    maps to the image col direction.  The transform decomposes each GPS offset
    into (East, North) metres, rotates into the building frame, then scales by
    DPI to get (row, col) pixel offsets.

    Returns a dict with keys: anchor_lon, anchor_lat, anchor_row, anchor_col,
    m_per_deg_lon, m_per_deg_lat, rotation_deg, dpi.
    """
    anchor_lon = (min(lons) + max(lons)) / 2.0
    anchor_lat = (min(lats) + max(lats)) / 2.0
    anchor_row = (IMG_ROWS - 1) / 2.0   # 110.0
    anchor_col = (IMG_COLS - 1) / 2.0   # 205.0

    lat_rad = math.radians(anchor_lat)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(lat_rad)

    theta = math.radians(BUILDING_ROTATION_DEG)

    return dict(
        anchor_lon=anchor_lon,
        anchor_lat=anchor_lat,
        anchor_row=anchor_row,
        anchor_col=anchor_col,
        m_per_deg_lon=m_per_deg_lon,
        m_per_deg_lat=m_per_deg_lat,
        rotation_deg=BUILDING_ROTATION_DEG,
        cos_t=math.cos(theta),
        sin_t=math.sin(theta),
        dpi=DPI,
    )


def gps_to_pixel(
    lon: float, lat: float, transform: dict
) -> tuple[float, float]:
    """
    Convert a WGS84 (lon, lat) point to (row, col) floorplan pixel coordinates.

    Decomposes the GPS offset into (East, North) metres, rotates by the building
    orientation angle, then scales by DPI.

      col direction = building long axis = rotation_deg east of north
      row direction = building short axis = perpendicular (east of col axis)
    """
    d_E = (lon - transform["anchor_lon"]) * transform["m_per_deg_lon"]
    d_N = (lat - transform["anchor_lat"]) * transform["m_per_deg_lat"]

    cos_t = transform["cos_t"]
    sin_t = transform["sin_t"]

    # Project onto building axes (rotation by theta from north):
    #   col += (sin_t * d_E + cos_t * d_N) * dpi   [long axis ~ north+theta]
    #   row += (cos_t * d_E - sin_t * d_N) * dpi   [short axis ~ east-theta]
    d_col_m =  sin_t * d_E + cos_t * d_N
    d_row_m =  cos_t * d_E - sin_t * d_N

    col = transform["anchor_col"] + d_col_m * transform["dpi"]
    row = transform["anchor_row"] + d_row_m * transform["dpi"]
    return row, col


# ---------------------------------------------------------------------------
# Walkability mask
# ---------------------------------------------------------------------------

def _load_walkability_mask() -> np.ndarray:
    """
    Load and return a boolean (IMG_ROWS, IMG_COLS) walkability mask.

    floorplan.png.npy is a float log-density map (9 quantised values, 0 = wall).
    Any pixel > 0 is considered walkable.
    """
    npy_path = REPO_ROOT / "niloc/data/avalon/floorplan.png.npy"
    arr = np.load(npy_path)
    if arr.shape != (IMG_ROWS, IMG_COLS):
        raise ValueError(
            f"Unexpected floorplan.png.npy shape {arr.shape}, "
            f"expected ({IMG_ROWS}, {IMG_COLS})"
        )
    mask = arr > 0.0
    frac = mask.mean()
    _LOG.info(
        "Walkability mask: %d / %d cells walkable (%.1f%%)",
        mask.sum(), mask.size, frac * 100,
    )
    return mask


# ---------------------------------------------------------------------------
# Bresenham line — used for edge wall-crossing check
# ---------------------------------------------------------------------------

def _bresenham(r0: int, c0: int, r1: int, c1: int) -> list[tuple[int, int]]:
    """Return all (row, col) integer cells on the line from (r0,c0) to (r1,c1)."""
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


def _edge_valid(
    r0: int, c0: int, r1: int, c1: int, mask: np.ndarray
) -> bool:
    """Return True if every cell on the Bresenham line is within the walkability mask."""
    for r, c in _bresenham(r0, c0, r1, c1):
        if r < 0 or r >= IMG_ROWS or c < 0 or c >= IMG_COLS:
            return False
        if not mask[r, c]:
            return False
    return True


# ---------------------------------------------------------------------------
# Checkpoint savers
# ---------------------------------------------------------------------------

def _load_floorplan_image() -> np.ndarray | None:
    """
    Load the floorplan image for background rendering, or None if unavailable.

    Preference order:
      1. detailed_floorplan.jpg — high-res CAD export at repo root
      2. niloc/data/avalon/floorplan.png — walk-density raster fallback
      3. floorplan.png.npy rendered as greyscale
    """
    import matplotlib.image as mpimg  # noqa: PLC0415

    for candidate in [
        REPO_ROOT / "detailed_floorplan.jpg",
        REPO_ROOT / "niloc/data/avalon/floorplan.png",
    ]:
        if candidate.exists():
            return mpimg.imread(str(candidate))

    npy_path = REPO_ROOT / "niloc/data/avalon/floorplan.png.npy"
    arr = np.load(npy_path)
    return np.stack([arr / arr.max()] * 3, axis=-1)


def _save_cp1(
    nodes_px: dict[str, tuple[float, float]],
    transform: dict,
) -> None:
    """
    Checkpoint 1: project all Level-2 nodes onto the floorplan (no filtering).
    Annotates anchor pixel and a compass arrow indicating north direction.
    """
    fp = _load_floorplan_image()
    fig, ax = plt.subplots(figsize=(10, 6))
    if fp is not None:
        ax.imshow(fp, origin="upper", aspect="auto",
                  extent=[0, IMG_COLS, IMG_ROWS, 0])

    cols = [rc[1] for rc in nodes_px.values()]
    rows = [rc[0] for rc in nodes_px.values()]
    ax.scatter(cols, rows, s=18, c="red", zorder=3, label=f"IMDF nodes (n={len(nodes_px)})")
    ax.scatter(
        [transform["anchor_col"]], [transform["anchor_row"]],
        s=80, c="cyan", marker="*", zorder=4, label="derived anchor"
    )
    # North arrow: anchor_col+Δcol, anchor_row+Δrow (north = +col direction)
    ax.annotate(
        "N", xy=(transform["anchor_col"] + 30, transform["anchor_row"]),
        xytext=(transform["anchor_col"], transform["anchor_row"]),
        arrowprops=dict(arrowstyle="->", color="cyan"),
        color="cyan", fontsize=10, fontweight="bold",
    )
    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title("CP1 — IMDF Level-2 nodes projected onto floorplan (no filtering)")
    ax.legend(fontsize=8)
    out = OUT_DIR / "cp1_nodes_raw.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    _LOG.info("Checkpoint 1 saved → %s", out)


def _save_cp2(
    nodes_ok: dict[str, tuple[float, float]],
    nodes_rejected: dict[str, tuple[float, float]],
    mask: np.ndarray,
) -> None:
    """Checkpoint 2: surviving vs rejected nodes on the walkability mask."""
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.imshow(mask.astype(np.uint8) * 200, cmap="gray", origin="upper", aspect="equal", vmin=0, vmax=255)

    if nodes_rejected:
        rej_cols = [rc[1] for rc in nodes_rejected.values()]
        rej_rows = [rc[0] for rc in nodes_rejected.values()]
        ax.scatter(rej_cols, rej_rows, s=18, c="red", zorder=3, label=f"rejected (n={len(nodes_rejected)})")

    ok_cols = [rc[1] for rc in nodes_ok.values()]
    ok_rows = [rc[0] for rc in nodes_ok.values()]
    ax.scatter(ok_cols, ok_rows, s=18, c="lime", zorder=4, label=f"valid (n={len(nodes_ok)})")

    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title(
        f"CP2 — Node filtering: {len(nodes_ok)} valid, {len(nodes_rejected)} rejected"
    )
    ax.legend(fontsize=8)
    out = OUT_DIR / "cp2_nodes_filtered.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    _LOG.info("Checkpoint 2 saved → %s", out)


def _save_cp3(
    nodes_ok: dict[str, tuple[float, float]],
    edges_ok: list[tuple[str, str]],
    edges_rejected: list[tuple[str, str]],
    mask: np.ndarray,
) -> None:
    """Checkpoint 3: valid vs rejected edges on the walkability mask."""
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.imshow(mask.astype(np.uint8) * 200, cmap="gray", origin="upper", aspect="equal", vmin=0, vmax=255)

    def _draw_edges(
        edges: list[tuple[str, str]], color: str, label: str
    ) -> None:
        for u, v in edges:
            if u not in nodes_ok or v not in nodes_ok:
                continue
            r0, c0 = nodes_ok[u]
            r1, c1 = nodes_ok[v]
            ax.plot([c0, c1], [r0, r1], color=color, linewidth=0.8, alpha=0.6)
        # Dummy scatter for legend
        ax.scatter([], [], c=color, s=12, label=label)

    _draw_edges(edges_rejected, "red", f"rejected edges (n={len(edges_rejected)})")
    _draw_edges(edges_ok, "lime", f"valid edges (n={len(edges_ok)})")

    ok_cols = [rc[1] for rc in nodes_ok.values()]
    ok_rows = [rc[0] for rc in nodes_ok.values()]
    ax.scatter(ok_cols, ok_rows, s=12, c="white", zorder=4)

    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title(
        f"CP3 — Edge validation: {len(edges_ok)} valid, {len(edges_rejected)} rejected"
    )
    ax.legend(fontsize=8)
    out = OUT_DIR / "cp3_edges.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    _LOG.info("Checkpoint 3 saved → %s", out)


def _save_final_overlay(
    nodes_ok: dict[str, tuple[float, float]],
    edges_ok: list[tuple[str, str]],
) -> None:
    """Final acceptance overlay: graph on the floorplan image."""
    fp = _load_floorplan_image()
    fig, ax = plt.subplots(figsize=(10, 6))
    if fp is not None:
        ax.imshow(fp, origin="upper", aspect="auto",
                  extent=[0, IMG_COLS, IMG_ROWS, 0])

    for u, v in edges_ok:
        if u not in nodes_ok or v not in nodes_ok:
            continue
        r0, c0 = nodes_ok[u]
        r1, c1 = nodes_ok[v]
        ax.plot([c0, c1], [r0, r1], color="cyan", linewidth=1.0, alpha=0.75)

    ok_cols = [rc[1] for rc in nodes_ok.values()]
    ok_rows = [rc[0] for rc in nodes_ok.values()]
    ax.scatter(ok_cols, ok_rows, s=20, c="red", zorder=4)

    ax.set_xlim(0, IMG_COLS)
    ax.set_ylim(IMG_ROWS, 0)
    ax.set_title(
        f"Validated Avalon graph — {len(nodes_ok)} nodes, {len(edges_ok)} edges"
    )
    out = OUT_DIR / "avalon_graph_overlay.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    _LOG.info("Final overlay saved → %s", out)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run(stop_after: int = 4) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # --- Load IMDF data ---------------------------------------------------
    with open(IMDF_DIR / "navigable_points.geojson") as fh:
        nav_pts = json.load(fh)
    with open(IMDF_DIR / "navigation_lines.geojson") as fh:
        nav_lines = json.load(fh)
    with open(IMDF_DIR / "graph_adjacency.json") as fh:
        adjacency: dict[str, list[dict]] = json.load(fh)

    # --- Filter to Level 2 -----------------------------------------------
    l2_features = [
        f for f in nav_pts["features"]
        if f["properties"]["level_id"] == LEVEL2_ID
    ]
    _LOG.info("Level-2 navigable points: %d / %d total", len(l2_features), len(nav_pts["features"]))

    l2_fids: set[int] = {f["properties"]["fid"] for f in l2_features}
    lons = [f["geometry"]["coordinates"][0] for f in l2_features]
    lats = [f["geometry"]["coordinates"][1] for f in l2_features]

    # --- Derive GPS transform --------------------------------------------
    transform = _build_gps_transform(lons, lats)
    _LOG.info(
        "GPS anchor: lon=%.7f lat=%.7f → pixel (row=%.1f, col=%.1f)",
        transform["anchor_lon"], transform["anchor_lat"],
        transform["anchor_row"], transform["anchor_col"],
    )
    _LOG.info(
        "Scale: %.1f px/deg-lat, %.1f px/deg-lon",
        transform["m_per_deg_lat"] * transform["dpi"],
        transform["m_per_deg_lon"] * transform["dpi"],
    )

    # --- Project all Level-2 nodes to pixels ----------------------------
    # Node IDs in the adjacency list use "point:<fid>" format.
    nodes_raw: dict[str, tuple[float, float]] = {}  # node_id → (row, col)
    for feat in l2_features:
        fid = feat["properties"]["fid"]
        lon, lat = feat["geometry"]["coordinates"]
        row, col = gps_to_pixel(lon, lat, transform)
        node_id = f"point:{fid}"
        nodes_raw[node_id] = (row, col)

    rows_px = [rc[0] for rc in nodes_raw.values()]
    cols_px = [rc[1] for rc in nodes_raw.values()]
    _LOG.info(
        "Projected pixel range: row [%.1f, %.1f], col [%.1f, %.1f]",
        min(rows_px), max(rows_px), min(cols_px), max(cols_px),
    )

    # =====================================================================
    # CHECKPOINT 1 — raw projection
    # =====================================================================
    _save_cp1(nodes_raw, transform)
    print(
        f"\n[CP1] Saved cp1_nodes_raw.png — {len(nodes_raw)} Level-2 nodes projected "
        f"onto floorplan.\n"
        f"      Row range: [{min(rows_px):.1f}, {max(rows_px):.1f}]  "
        f"(image height = {IMG_ROWS})\n"
        f"      Col range: [{min(cols_px):.1f}, {max(cols_px):.1f}]  "
        f"(image width  = {IMG_COLS})\n"
        f"      Inspect cp1_nodes_raw.png — nodes should fall within walkable corridors."
    )
    if stop_after == 1:
        return

    # =====================================================================
    # CHECKPOINT 2 — walkability mask filtering
    # =====================================================================
    mask = _load_walkability_mask()

    nodes_ok: dict[str, tuple[float, float]] = {}
    nodes_rejected: dict[str, tuple[float, float]] = {}

    for node_id, (row, col) in nodes_raw.items():
        ri, ci = int(round(row)), int(round(col))
        in_bounds = (0 <= ri < IMG_ROWS) and (0 <= ci < IMG_COLS)
        if in_bounds and mask[ri, ci]:
            nodes_ok[node_id] = (row, col)
        else:
            nodes_rejected[node_id] = (row, col)

    _LOG.info(
        "Node filtering: %d valid, %d rejected (%.0f%% pass rate)",
        len(nodes_ok), len(nodes_rejected),
        100 * len(nodes_ok) / len(nodes_raw) if nodes_raw else 0,
    )

    _save_cp2(nodes_ok, nodes_rejected, mask)
    print(
        f"\n[CP2] Saved cp2_nodes_filtered.png — "
        f"{len(nodes_ok)} valid, {len(nodes_rejected)} rejected nodes.\n"
        f"      Inspect cp2_nodes_filtered.png — green nodes should be inside "
        f"walkable pixels, red nodes outside."
    )
    if stop_after == 2:
        return

    # =====================================================================
    # CHECKPOINT 3 — edge validation
    # =====================================================================
    # Collect Level-2 edges from the adjacency list (both directions).
    # We only keep edges where BOTH endpoints are in nodes_ok.
    seen_pairs: set[frozenset] = set()
    edges_ok: list[tuple[str, str]] = []
    edges_rejected: list[tuple[str, str]] = []

    for src, neighbours in adjacency.items():
        if src not in nodes_ok:
            continue
        for nbr in neighbours:
            dst = nbr["node"]
            if dst not in nodes_ok:
                continue
            pair = frozenset((src, dst))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            r0, c0 = nodes_ok[src]
            r1, c1 = nodes_ok[dst]
            if _edge_valid(int(round(r0)), int(round(c0)), int(round(r1)), int(round(c1)), mask):
                edges_ok.append((src, dst))
            else:
                edges_rejected.append((src, dst))

    _LOG.info(
        "Edge validation: %d valid, %d rejected (%.0f%% pass rate)",
        len(edges_ok), len(edges_rejected),
        100 * len(edges_ok) / (len(edges_ok) + len(edges_rejected))
        if (edges_ok or edges_rejected) else 0,
    )

    _save_cp3(nodes_ok, edges_ok, edges_rejected, mask)
    print(
        f"\n[CP3] Saved cp3_edges.png — "
        f"{len(edges_ok)} valid edges, {len(edges_rejected)} rejected.\n"
        f"      Inspect cp3_edges.png — green edges should follow corridors, "
        f"red edges should cross walls."
    )
    if stop_after == 3:
        return

    # =====================================================================
    # CHECKPOINT 4 — serialise graph + final overlay
    # =====================================================================

    # Build the output: node pixel coordinates + adjacency list (pixel distances).
    # Distances are recomputed in pixels from the validated pixel positions.
    graph: dict = {
        "meta": {
            "source": "MappingForMassesMobile/IMDF/IMDFAvalon",
            "level_id": LEVEL2_ID,
            "level_name": "Level 2",
            "transform": transform,
            "img_rows": IMG_ROWS,
            "img_cols": IMG_COLS,
            "dpi": DPI,
            "n_nodes": len(nodes_ok),
            "n_edges": len(edges_ok),
        },
        "nodes": {
            node_id: {"row": row, "col": col}
            for node_id, (row, col) in nodes_ok.items()
        },
        "edges": [
            {
                "u": u,
                "v": v,
                "weight_px": math.hypot(
                    nodes_ok[v][0] - nodes_ok[u][0],
                    nodes_ok[v][1] - nodes_ok[u][1],
                ),
            }
            for u, v in edges_ok
        ],
    }

    with open(OUT_GRAPH, "w") as fh:
        json.dump(graph, fh, indent=2)
    _LOG.info("Graph written → %s", OUT_GRAPH)

    _save_final_overlay(nodes_ok, edges_ok)
    print(
        f"\n[CP4] Graph serialised → {OUT_GRAPH}\n"
        f"      {len(nodes_ok)} nodes, {len(edges_ok)} edges\n"
        f"      Final overlay saved → {OUT_DIR / 'avalon_graph_overlay.png'}\n"
        f"\n      Issue #15 acceptance: inspect avalon_graph_overlay.png for\n"
        f"      visual confirmation that nodes/edges cover the walkable floor."
    )


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(
        description="Validate and extract the Avalon navigation graph from IMDF (issue #15)."
    )
    parser.add_argument(
        "--stop-after",
        type=int,
        default=4,
        choices=[1, 2, 3, 4],
        help=(
            "Stop after checkpoint N and save its QA image without proceeding further. "
            "1=raw projection, 2=node filtering, 3=edge validation, 4=full output (default)."
        ),
    )
    args = parser.parse_args(argv)
    run(stop_after=args.stop_after)
    return 0


if __name__ == "__main__":
    sys.exit(main())
