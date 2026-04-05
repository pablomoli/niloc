"""Tests for preprocess.synthetic_data.graph_path_generator."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from preprocess.synthetic_data.graph_path_generator import (
    _dijkstra,
    _smooth_and_resample,
    generate_paths,
    load_graph,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_graph(tmp_path: Path, nodes: dict, edges: list) -> Path:
    """Write a minimal graph JSON and return its path."""
    g = {
        "meta": {"n_nodes": len(nodes), "n_edges": len(edges)},
        "nodes": {nid: {"row": rc[0], "col": rc[1]} for nid, rc in nodes.items()},
        "edges": [{"u": u, "v": v, "weight_px": w} for u, v, w in edges],
    }
    p = tmp_path / "graph.json"
    p.write_text(json.dumps(g))
    return p


@pytest.fixture()
def square_graph(tmp_path: Path) -> Path:
    """A small 5-node graph laid out as a cross (+) in pixel space."""
    nodes = {
        "A": (100.0, 100.0),
        "B": (100.0, 150.0),
        "C": (100.0, 200.0),
        "D": (50.0, 150.0),
        "E": (150.0, 150.0),
    }
    edges = [
        ("A", "B", 50.0),
        ("B", "C", 50.0),
        ("B", "D", 50.0),
        ("B", "E", 50.0),
    ]
    return _write_graph(tmp_path, nodes, edges)


@pytest.fixture()
def linear_graph(tmp_path: Path) -> Path:
    """Six nodes in a straight horizontal line."""
    nodes = {str(i): (100.0, float(i * 30)) for i in range(6)}
    edges = [(str(i), str(i + 1), 30.0) for i in range(5)]
    return _write_graph(tmp_path, nodes, edges)


@pytest.fixture()
def avalon_graph() -> Path:
    """Real Avalon graph; skipped if the file is absent."""
    p = Path(__file__).parents[1] / "preprocess/synthetic_data/data/avalon_graph.json"
    if not p.exists():
        pytest.skip("avalon_graph.json not found")
    return p


# ---------------------------------------------------------------------------
# load_graph
# ---------------------------------------------------------------------------


class TestLoadGraph:
    def test_nodes_and_adjacency(self, square_graph: Path) -> None:
        nodes, adj = load_graph(square_graph)
        assert set(nodes.keys()) == {"A", "B", "C", "D", "E"}
        assert nodes["A"] == (100.0, 100.0)
        # B is connected to A, C, D, E
        neighbours = {v for v, _ in adj["B"]}
        assert neighbours == {"A", "C", "D", "E"}

    def test_edges_are_undirected(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        a_neighbours = {v for v, _ in adj["A"]}
        assert "B" in a_neighbours

    def test_weights_are_positive(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        for neighbours in adj.values():
            for _, w in neighbours:
                assert w > 0.0


# ---------------------------------------------------------------------------
# _dijkstra
# ---------------------------------------------------------------------------


class TestDijkstra:
    def _adj(self, square_graph: Path) -> dict:
        _, adj = load_graph(square_graph)
        return adj

    def test_direct_path(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        path = _dijkstra(adj, "A", "B")
        assert path == ["A", "B"]

    def test_two_hop_path(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        path = _dijkstra(adj, "A", "C")
        assert path == ["A", "B", "C"]

    def test_three_hop_path(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        path = _dijkstra(adj, "D", "C")
        assert path is not None
        assert path[0] == "D" and path[-1] == "C"
        assert len(path) == 3  # D→B→C

    def test_src_equals_dst(self, square_graph: Path) -> None:
        _, adj = load_graph(square_graph)
        path = _dijkstra(adj, "A", "A")
        assert path == ["A"]

    def test_no_path_disconnected(self, tmp_path: Path) -> None:
        # Two isolated nodes
        p = _write_graph(
            tmp_path,
            {"X": (0.0, 0.0), "Y": (1.0, 1.0)},
            [],
        )
        _, adj = load_graph(p)
        assert _dijkstra(adj, "X", "Y") is None

    def test_chooses_shorter_route(self, tmp_path: Path) -> None:
        # A→B direct = 100, A→C→B = 10+10 = 20 (should prefer A→C→B)
        p = _write_graph(
            tmp_path,
            {"A": (0.0, 0.0), "B": (0.0, 100.0), "C": (0.0, 10.0)},
            [("A", "B", 100.0), ("A", "C", 10.0), ("C", "B", 10.0)],
        )
        _, adj = load_graph(p)
        path = _dijkstra(adj, "A", "B")
        assert path == ["A", "C", "B"]


# ---------------------------------------------------------------------------
# _smooth_and_resample
# ---------------------------------------------------------------------------


class TestSmoothAndResample:
    def _rng(self) -> np.random.Generator:
        return np.random.default_rng(0)

    def test_output_shape(self) -> None:
        pts = np.array([[0.0, 0.0], [50.0, 0.0], [100.0, 0.0],
                        [150.0, 0.0], [200.0, 0.0]], dtype=float)
        traj = _smooth_and_resample(pts, avg_speed_px_s=10.0, freq=1.0,
                                    smooth_factor=2.0, rng=self._rng())
        assert traj.ndim == 2
        assert traj.shape[1] == 5

    def test_timestamps_monotone(self) -> None:
        pts = np.array([[0.0, i * 30.0] for i in range(6)], dtype=float)
        traj = _smooth_and_resample(pts, avg_speed_px_s=10.0, freq=1.0,
                                    smooth_factor=2.0, rng=self._rng())
        assert np.all(np.diff(traj[:, 0]) > 0)

    def test_smooth_equals_gt_columns(self) -> None:
        # Columns 1,2 (smooth) must equal columns 3,4 (gt) at this stage.
        pts = np.array([[0.0, i * 20.0] for i in range(5)], dtype=float)
        traj = _smooth_and_resample(pts, avg_speed_px_s=10.0, freq=1.0,
                                    smooth_factor=2.0, rng=self._rng())
        np.testing.assert_array_equal(traj[:, 1:3], traj[:, 3:5])

    def test_raises_on_too_few_points(self) -> None:
        pts = np.array([[0.0, 0.0], [0.0, 0.0]], dtype=float)  # all duplicates
        with pytest.raises(ValueError):
            _smooth_and_resample(pts, avg_speed_px_s=10.0, freq=1.0,
                                 smooth_factor=2.0, rng=self._rng())

    def test_path_length_scales_with_speed(self) -> None:
        pts = np.array([[0.0, i * 50.0] for i in range(6)], dtype=float)
        rng = np.random.default_rng(1)
        slow = _smooth_and_resample(pts, avg_speed_px_s=5.0, freq=1.0,
                                    smooth_factor=2.0, rng=rng)
        rng = np.random.default_rng(1)
        fast = _smooth_and_resample(pts, avg_speed_px_s=20.0, freq=1.0,
                                    smooth_factor=2.0, rng=rng)
        # Slower speed → more frames for the same physical path.
        assert len(slow) > len(fast)


# ---------------------------------------------------------------------------
# generate_paths
# ---------------------------------------------------------------------------


class TestGeneratePaths:
    def test_returns_requested_count(self, linear_graph: Path) -> None:
        paths = generate_paths(
            n_paths=5,
            graph_path=linear_graph,
            freq=1.0,
            avg_speed_px_s=15.0,
            min_path_nodes=2,
            rng=np.random.default_rng(0),
        )
        assert len(paths) == 5

    def test_output_has_five_columns(self, linear_graph: Path) -> None:
        paths = generate_paths(
            n_paths=3,
            graph_path=linear_graph,
            freq=1.0,
            avg_speed_px_s=15.0,
            min_path_nodes=2,
            rng=np.random.default_rng(0),
        )
        for p in paths:
            assert p.shape[1] == 5

    def test_output_is_float64(self, linear_graph: Path) -> None:
        paths = generate_paths(
            n_paths=2,
            graph_path=linear_graph,
            freq=1.0,
            avg_speed_px_s=15.0,
            min_path_nodes=2,
            rng=np.random.default_rng(0),
        )
        for p in paths:
            assert p.dtype == np.float64

    def test_no_nan_or_inf(self, linear_graph: Path) -> None:
        paths = generate_paths(
            n_paths=4,
            graph_path=linear_graph,
            freq=1.0,
            avg_speed_px_s=15.0,
            min_path_nodes=2,
            rng=np.random.default_rng(42),
        )
        for p in paths:
            assert not np.any(np.isnan(p))
            assert not np.any(np.isinf(p))

    def test_smooth_equals_gt(self, linear_graph: Path) -> None:
        paths = generate_paths(
            n_paths=3,
            graph_path=linear_graph,
            freq=1.0,
            avg_speed_px_s=15.0,
            min_path_nodes=2,
            rng=np.random.default_rng(0),
        )
        for p in paths:
            np.testing.assert_array_equal(p[:, 1:3], p[:, 3:5])

    def test_reproducible_with_same_seed(self, linear_graph: Path) -> None:
        kwargs = dict(n_paths=3, graph_path=linear_graph, freq=1.0,
                      avg_speed_px_s=15.0, min_path_nodes=2)
        paths_a = generate_paths(**kwargs, rng=np.random.default_rng(7))
        paths_b = generate_paths(**kwargs, rng=np.random.default_rng(7))
        for a, b in zip(paths_a, paths_b):
            np.testing.assert_array_equal(a, b)

    def test_avalon_graph_smoke(self, avalon_graph: Path) -> None:
        """Smoke test against the real Avalon graph — 20 paths, no crash."""
        paths = generate_paths(
            n_paths=20,
            graph_path=avalon_graph,
            freq=1.0,
            avg_speed_px_s=12.0,
            rng=np.random.default_rng(0),
        )
        assert len(paths) == 20
        for p in paths:
            assert p.shape[1] == 5
            assert not np.any(np.isnan(p))
