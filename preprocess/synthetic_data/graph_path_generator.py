"""
Issue #16 — Graph-based synthetic path generator for Avalon 2nd floor.

Generates GT trajectories by routing uniformly-sampled source/destination
pairs through the validated IMDF navigation graph, then smoothing the
discrete waypoint sequence into continuous trajectories compatible with
the fabrication pipeline's inject_noise.fabricate().

Output format matches load_gt_paths() in fabricate.py:
    (T, 5) float64  columns: [ts, smooth_row, smooth_col, gt_row, gt_col]
    where smooth_* == gt_* (no noise at this stage).

Usage (standalone)
------------------
    uv run python -m preprocess.synthetic_data.graph_path_generator
    uv run python -m preprocess.synthetic_data.graph_path_generator \\
        --n-paths 50 --out-dir /tmp/graph_paths --seed 7
"""

from __future__ import annotations

import argparse
import heapq
import json
import logging
import sys
from pathlib import Path

import numpy as np
from scipy.interpolate import splev, splprep

_LOG = logging.getLogger(__name__)

# Minimum number of graph nodes in a routed path; shorter paths produce
# degenerate splines and are discarded.
_MIN_WAYPOINTS = 4

# Graph output relative to this file's directory.
_DEFAULT_GRAPH = Path(__file__).parent / "data" / "avalon_graph.json"


# ---------------------------------------------------------------------------
# Graph loading
# ---------------------------------------------------------------------------


def load_graph(
    graph_path: Path,
) -> tuple[dict[str, tuple[float, float]], dict[str, list[tuple[str, float]]]]:
    """
    Load avalon_graph.json and build an adjacency representation.

    Parameters
    ----------
    graph_path : path to the avalon_graph.json produced by validate_avalon_graph.py

    Returns
    -------
    nodes : dict  {node_id -> (row, col)}
    adj   : dict  {node_id -> [(neighbour_id, weight_px), ...]}
    """
    data = json.loads(Path(graph_path).read_text())
    nodes: dict[str, tuple[float, float]] = {
        nid: (nd["row"], nd["col"]) for nid, nd in data["nodes"].items()
    }
    adj: dict[str, list[tuple[str, float]]] = {nid: [] for nid in nodes}
    for edge in data["edges"]:
        u, v, w = edge["u"], edge["v"], float(edge["weight_px"])
        adj[u].append((v, w))
        adj[v].append((u, w))

    _LOG.debug("Loaded graph: %d nodes, %d edges", len(nodes), len(data["edges"]))
    return nodes, adj


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


def _dijkstra(
    adj: dict[str, list[tuple[str, float]]],
    src: str,
    dst: str,
) -> list[str] | None:
    """
    Shortest path from src to dst on the adjacency graph.

    Parameters
    ----------
    adj : adjacency dict from load_graph
    src : source node ID
    dst : destination node ID

    Returns
    -------
    Ordered list of node IDs from src to dst inclusive, or None if no path
    exists (the Avalon graph is fully connected so None should not occur).
    """
    dist: dict[str, float] = {src: 0.0}
    prev: dict[str, str | None] = {src: None}
    heap: list[tuple[float, str]] = [(0.0, src)]

    while heap:
        d, u = heapq.heappop(heap)
        if u == dst:
            path: list[str] = []
            cur: str | None = dst
            while cur is not None:
                path.append(cur)
                cur = prev.get(cur)
            return list(reversed(path))
        if d > dist.get(u, float("inf")):
            continue
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))

    return None  # unreachable on a connected graph


# ---------------------------------------------------------------------------
# Trajectory smoothing and resampling
# ---------------------------------------------------------------------------


def _smooth_and_resample(
    waypoints: np.ndarray,
    avg_speed_px_s: float,
    freq: float,
    smooth_factor: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Fit a B-spline to graph waypoints and resample at uniform speed.

    The spline is evaluated at a dense set of parameter values to build a
    cumulative arc-length table, then uniformly-spaced time steps are mapped
    back to spline parameters via linear interpolation.  This gives constant-
    speed output without the density-map optimisation that SmoothTrajectory
    uses (not needed here because graph nodes are already walkable).

    Parameters
    ----------
    waypoints       : (N, 2) float array  [row, col] at each graph node
    avg_speed_px_s  : mean walking speed in pixels/second
    freq            : output frequency in Hz
    smooth_factor   : B-spline smoothing divisor; s = N / smooth_factor
                      (higher value → smoother, less faithful to waypoints)
    rng             : numpy Generator used for speed variation (±5 %)

    Returns
    -------
    (T, 5) float64 array — columns: [ts, row, col, row, col]
    The last two columns duplicate the first two (smooth == gt at this stage).

    Raises
    ------
    ValueError if the path is too short or numerically degenerate.
    """
    # Remove consecutive duplicate points that make splprep fail.
    dists = np.linalg.norm(np.diff(waypoints, axis=0), axis=1)
    keep = np.concatenate([[True], dists > 1e-6])
    pts = waypoints[keep]

    if len(pts) < 3:
        raise ValueError(f"Too few unique waypoints after deduplication: {len(pts)}")

    k = min(3, len(pts) - 1)
    s = len(pts) / smooth_factor
    tck, u = splprep(pts.T, s=s, k=k)

    # Dense evaluation for arc-length parameterisation.
    n_dense = max(1000, len(pts) * 40)
    u_dense = np.linspace(0.0, 1.0, n_dense)
    rows_d, cols_d = splev(u_dense, tck)
    dense = np.column_stack([rows_d, cols_d])

    arc = np.cumsum(
        np.concatenate([[0.0], np.linalg.norm(np.diff(dense, axis=0), axis=1)])
    )
    total_len = arc[-1]

    if total_len < 1.0:
        raise ValueError(f"Total path arc length too short: {total_len:.2f} px")

    # Add ±5 % speed jitter so augmented trajectories differ in length.
    speed = float(rng.normal(avg_speed_px_s, avg_speed_px_s * 0.05))
    speed = max(speed, avg_speed_px_s * 0.5)

    total_time = total_len / speed
    ts = np.arange(0.0, total_time, 1.0 / freq)

    if len(ts) < 2:
        raise ValueError(
            f"Path too short for speed={speed:.1f} px/s and freq={freq:.1f} Hz "
            f"(total_len={total_len:.1f} px, total_time={total_time:.1f} s)"
        )

    # Map uniform time steps to spline parameter u.
    u_uniform = np.interp(ts * speed, arc, u_dense)
    rows, cols = splev(u_uniform, tck)

    traj = np.column_stack([ts, rows, cols, rows, cols]).astype(np.float64)
    return traj


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_paths(
    n_paths: int,
    graph_path: Path = _DEFAULT_GRAPH,
    freq: float = 1.0,
    avg_speed_px_s: float = 12.0,
    smooth_factor: float = 2.0,
    min_path_nodes: int = _MIN_WAYPOINTS,
    rng: np.random.Generator | None = None,
    max_attempts_multiplier: int = 10,
) -> list[np.ndarray]:
    """
    Generate n_paths graph-routed synthetic GT trajectories.

    Source/destination node pairs are sampled uniformly without replacement
    from the graph node list, ensuring coverage across the full floor rather
    than concentration in high-density recording areas.

    Parameters
    ----------
    n_paths                 : number of GT paths to produce
    graph_path              : path to avalon_graph.json
    freq                    : output frequency in Hz (must match fabrication config)
    avg_speed_px_s          : mean walking speed in pixels/second.
                              At Avalon's 10 px/m, 12 px/s ≈ 1.2 m/s (brisk walk).
    smooth_factor           : B-spline smoothing divisor (see _smooth_and_resample)
    min_path_nodes          : discard source/dest pairs whose route has fewer nodes
    rng                     : numpy Generator for reproducibility; created if None
    max_attempts_multiplier : retry budget = n_paths × this value

    Returns
    -------
    List of (T_i, 5) float64 arrays in load_gt_paths() format.
    May be shorter than n_paths if the budget is exhausted (logged as warning).
    """
    if rng is None:
        rng = np.random.default_rng()

    nodes, adj = load_graph(graph_path)
    node_ids = list(nodes.keys())
    n_nodes = len(node_ids)
    _LOG.info("Loaded graph: %d nodes", n_nodes)

    results: list[np.ndarray] = []
    attempts = 0
    max_attempts = n_paths * max_attempts_multiplier

    while len(results) < n_paths and attempts < max_attempts:
        attempts += 1

        # Sample without replacement so src != dst.
        idx_src, idx_dst = rng.choice(n_nodes, size=2, replace=False)
        src_id = node_ids[int(idx_src)]
        dst_id = node_ids[int(idx_dst)]

        path_ids = _dijkstra(adj, src_id, dst_id)
        if path_ids is None or len(path_ids) < min_path_nodes:
            _LOG.debug(
                "Skipping %s→%s: path length %s < %d",
                src_id,
                dst_id,
                len(path_ids) if path_ids else "None",
                min_path_nodes,
            )
            continue

        waypoints = np.array([nodes[nid] for nid in path_ids], dtype=np.float64)
        try:
            traj = _smooth_and_resample(
                waypoints,
                avg_speed_px_s=avg_speed_px_s,
                freq=freq,
                smooth_factor=smooth_factor,
                rng=rng,
            )
        except ValueError as exc:
            _LOG.debug("Skipping %s→%s: %s", src_id, dst_id, exc)
            continue

        results.append(traj)
        _LOG.debug(
            "Path %d/%d: %s→%s  %d waypoints  %d frames",
            len(results),
            n_paths,
            src_id,
            dst_id,
            len(path_ids),
            len(traj),
        )

    if len(results) < n_paths:
        _LOG.warning(
            "Generated %d/%d paths after %d attempts (increase max_attempts_multiplier "
            "or lower min_path_nodes if this is unexpected)",
            len(results),
            n_paths,
            attempts,
        )
    else:
        _LOG.info("Generated %d graph-routed paths in %d attempts", n_paths, attempts)

    return results


# ---------------------------------------------------------------------------
# CLI entry point (for quick manual inspection)
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="graph_path_generator",
        description="Generate graph-routed GT paths and write them to disk.",
    )
    p.add_argument("--graph", type=Path, default=_DEFAULT_GRAPH)
    p.add_argument("--n-paths", type=int, default=20)
    p.add_argument("--out-dir", type=Path, default=None)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--freq", type=float, default=1.0)
    p.add_argument("--avg-speed", type=float, default=12.0)
    return p


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    args = _build_parser().parse_args(argv)
    rng = np.random.default_rng(args.seed)
    paths = generate_paths(
        n_paths=args.n_paths,
        graph_path=args.graph,
        freq=args.freq,
        avg_speed_px_s=args.avg_speed,
        rng=rng,
    )

    if args.out_dir is not None:
        out = Path(args.out_dir)
        out.mkdir(parents=True, exist_ok=True)
        for i, traj in enumerate(paths):
            p = out / f"graph_path_{i:04d}.txt"
            header = "ts_seconds,smooth_x,smooth_y,gt_x,gt_y"
            np.savetxt(p, traj, header=header)
        print(f"Wrote {len(paths)} paths to {out}")
    else:
        for i, traj in enumerate(paths):
            print(f"Path {i:3d}: {len(traj):4d} frames  "
                  f"row=[{traj[:,3].min():.1f}, {traj[:,3].max():.1f}]  "
                  f"col=[{traj[:,4].min():.1f}, {traj[:,4].max():.1f}]")

    return 0


if __name__ == "__main__":
    sys.exit(main())
