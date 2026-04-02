"""Tests for preprocess/synthetic_data/smooth_junctions.py."""

from __future__ import annotations

import numpy as np
import pytest

from preprocess.synthetic_data.smooth_junctions import (
    detect_junctions,
    make_timestamps,
    smooth_junctions,
    smooth_path,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _straight_path(n: int = 100, dx: float = 1.0) -> np.ndarray:
    """Perfectly straight horizontal path — should have no junctions."""
    x = np.arange(n, dtype=float) * dx
    return np.stack([x, np.zeros(n)], axis=1)


def _path_with_sharp_turn(
    n_before: int = 50,
    n_after: int = 50,
    turn_deg: float = 90.0,
) -> np.ndarray:
    """
    Horizontal segment followed by a segment at turn_deg.
    Junction is at frame n_before.
    """
    angle = np.radians(turn_deg)
    seg1 = np.stack([np.arange(n_before, dtype=float), np.zeros(n_before)], axis=1)
    t = np.arange(1, n_after + 1, dtype=float)
    seg2_x = seg1[-1, 0] + t * np.cos(angle)
    seg2_y = seg1[-1, 1] + t * np.sin(angle)
    seg2 = np.stack([seg2_x, seg2_y], axis=1)
    return np.concatenate([seg1, seg2], axis=0)


def _turning_angle_at(path: np.ndarray, frame: int) -> float:
    """Compute the turning angle in degrees at a specific frame."""
    if frame <= 0 or frame >= len(path) - 1:
        return 0.0
    v_in  = path[frame]     - path[frame - 1]
    v_out = path[frame + 1] - path[frame]
    n_in  = np.linalg.norm(v_in)
    n_out = np.linalg.norm(v_out)
    if n_in < 1e-8 or n_out < 1e-8:
        return 0.0
    cos_a = np.clip(np.dot(v_in, v_out) / (n_in * n_out), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_a)))


# ---------------------------------------------------------------------------
# detect_junctions
# ---------------------------------------------------------------------------


class TestDetectJunctions:
    def test_straight_path_no_junctions(self) -> None:
        path = _straight_path(100)
        assert detect_junctions(path) == []

    def test_detects_sharp_turn(self) -> None:
        path = _path_with_sharp_turn(50, 50, turn_deg=90.0)
        junctions = detect_junctions(path, angle_threshold_deg=15.0)
        # The junction lands at frame 49 — the angle between v[48] and v[49]
        # is flagged and mapped to i+1 = 49 (last frame before direction changes)
        assert len(junctions) >= 1
        assert abs(junctions[0] - 50) <= 1

    def test_below_threshold_not_flagged(self) -> None:
        path = _path_with_sharp_turn(50, 50, turn_deg=5.0)
        junctions = detect_junctions(path, angle_threshold_deg=15.0)
        assert junctions == []

    def test_min_gap_merges_close_junctions(self) -> None:
        # Two 90-degree turns separated by 5 frames — should merge to one
        seg1 = _straight_path(30)
        seg2 = _path_with_sharp_turn(5, 5, turn_deg=90.0)
        seg3 = _path_with_sharp_turn(5, 30, turn_deg=90.0)
        path = np.concatenate([seg1, seg2, seg3], axis=0)
        junctions = detect_junctions(path, angle_threshold_deg=15.0, min_gap=10)
        # All close junctions should be merged — max one per min_gap window
        for i in range(len(junctions) - 1):
            assert junctions[i + 1] - junctions[i] >= 10

    def test_too_short_path(self) -> None:
        assert detect_junctions(np.zeros((2, 2))) == []

    def test_returns_interior_frames_only(self) -> None:
        path = _path_with_sharp_turn(50, 50, turn_deg=90.0)
        junctions = detect_junctions(path)
        assert all(0 < j < len(path) - 1 for j in junctions)


# ---------------------------------------------------------------------------
# smooth_path
# ---------------------------------------------------------------------------


class TestSmoothPath:
    def test_output_shape_preserved(self) -> None:
        path = _path_with_sharp_turn(50, 50, turn_deg=90.0)
        junctions = detect_junctions(path)
        result = smooth_path(path, junctions)
        assert result.shape == path.shape

    def test_endpoints_pinned(self) -> None:
        """First and last points must not move."""
        path = _path_with_sharp_turn(50, 50, turn_deg=90.0)
        junctions = detect_junctions(path)
        result = smooth_path(path, junctions, half_window=20)
        np.testing.assert_allclose(result[0],  path[0],  atol=1e-6)
        np.testing.assert_allclose(result[-1], path[-1], atol=1e-6)

    def test_junction_angle_reduced(self) -> None:
        """Turn angle at the junction should decrease after smoothing."""
        path = _path_with_sharp_turn(80, 80, turn_deg=90.0)
        junctions = detect_junctions(path)
        assert junctions, "Expected at least one junction"
        jf = junctions[0]
        before_angle = _turning_angle_at(path, jf)
        result = smooth_path(path, junctions, half_window=20)
        after_angle = _turning_angle_at(result, jf)
        assert after_angle < before_angle

    def test_no_nan_or_inf(self) -> None:
        path = _path_with_sharp_turn(60, 60, turn_deg=120.0)
        junctions = detect_junctions(path)
        result = smooth_path(path, junctions)
        assert np.all(np.isfinite(result))

    def test_unmodified_outside_window(self) -> None:
        """Frames far from any junction should be unchanged."""
        path = _path_with_sharp_turn(80, 80, turn_deg=90.0)
        junctions = detect_junctions(path)
        result = smooth_path(path, junctions, half_window=20)
        # First 20 frames are well outside the junction window at frame 80
        np.testing.assert_array_equal(result[:20], path[:20])

    def test_empty_junctions_returns_copy(self) -> None:
        path = _straight_path(100)
        result = smooth_path(path, [])
        np.testing.assert_array_equal(result, path)


# ---------------------------------------------------------------------------
# smooth_junctions (combined)
# ---------------------------------------------------------------------------


class TestSmoothJunctions:
    def test_returns_two_values(self) -> None:
        path = _path_with_sharp_turn(50, 50)
        result, junctions = smooth_junctions(path)
        assert result.shape == path.shape
        assert isinstance(junctions, list)

    def test_straight_path_unchanged(self) -> None:
        path = _straight_path(100)
        result, junctions = smooth_junctions(path)
        assert junctions == []
        np.testing.assert_array_equal(result, path)

    def test_sharp_path_junctions_detected_and_smoothed(self) -> None:
        path = _path_with_sharp_turn(80, 80, turn_deg=90.0)
        result, junctions = smooth_junctions(path, angle_threshold_deg=15.0)
        assert len(junctions) >= 1
        jf = junctions[0]
        assert _turning_angle_at(result, jf) < _turning_angle_at(path, jf)

    def test_turning_angle_spike_reduced(self) -> None:
        """Peak angular change at the junction should decrease after smoothing."""
        path = _path_with_sharp_turn(80, 80, turn_deg=90.0)
        result, junctions = smooth_junctions(path, angle_threshold_deg=15.0, half_window=20)
        assert junctions
        jf = junctions[0]
        assert _turning_angle_at(result, jf) < _turning_angle_at(path, jf)


# ---------------------------------------------------------------------------
# make_timestamps
# ---------------------------------------------------------------------------


class TestMakeTimestamps:
    def test_starts_at_zero(self) -> None:
        ts = make_timestamps(100, freq=10.0)
        assert ts[0] == pytest.approx(0.0)

    def test_length_matches(self) -> None:
        ts = make_timestamps(500, freq=1.0)
        assert len(ts) == 500

    def test_step_equals_one_over_freq(self) -> None:
        freq = 10.0
        ts = make_timestamps(100, freq=freq)
        diffs = np.diff(ts)
        np.testing.assert_allclose(diffs, 1.0 / freq, rtol=1e-10)

    def test_default_freq_one_hz(self) -> None:
        ts = make_timestamps(10)
        np.testing.assert_allclose(ts, np.arange(10, dtype=float))
