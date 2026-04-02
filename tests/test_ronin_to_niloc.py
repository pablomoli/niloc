"""Tests for preprocess.inference.ronin_to_niloc."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pytest

from preprocess.inference.ronin_to_niloc import convert

if TYPE_CHECKING:
    from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_npy(tmp_path: Path, shape: tuple[int, ...], seed: int = 0) -> Path:
    rng = np.random.default_rng(seed)
    p = tmp_path / "ronin_out.npy"
    np.save(p, rng.uniform(-10, 10, shape).astype(np.float64))
    return p


# ---------------------------------------------------------------------------
# DPI scaling
# ---------------------------------------------------------------------------

class TestDpiScaling:
    def test_dpi_applied_to_vio_xy(self, tmp_path):
        pos = np.array([[1.0, 2.0], [3.0, 4.0]])
        npy = tmp_path / "pos.npy"
        np.save(npy, pos)
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        np.testing.assert_allclose(result[:, 1], [10.0, 30.0])
        np.testing.assert_allclose(result[:, 2], [20.0, 40.0])

    def test_different_dpi_values(self, tmp_path):
        pos = np.ones((5, 2))   # 1 metre everywhere
        npy = tmp_path / "pos.npy"
        np.save(npy, pos)
        for dpi in (2.5, 10.0, 100.0):
            out = tmp_path / f"out_{dpi}.txt"
            convert(npy, out, dpi=dpi)
            result = np.loadtxt(out)
            np.testing.assert_allclose(result[:, 1], dpi)
            np.testing.assert_allclose(result[:, 2], dpi)


# ---------------------------------------------------------------------------
# GT columns are zero at inference time
# ---------------------------------------------------------------------------

class TestGtZeros:
    def test_gt_x_gt_y_are_zero(self, tmp_path):
        npy = _make_npy(tmp_path, (20, 2))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        np.testing.assert_array_equal(result[:, 3], 0.0)
        np.testing.assert_array_equal(result[:, 4], 0.0)

    def test_gt_zeros_for_four_column_input(self, tmp_path):
        # (T, 4) input — last two cols are gt; should still output zeros
        npy = _make_npy(tmp_path, (15, 4))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=5.0)
        result = np.loadtxt(out)
        np.testing.assert_array_equal(result[:, 3], 0.0)
        np.testing.assert_array_equal(result[:, 4], 0.0)


# ---------------------------------------------------------------------------
# Output shape and format
# ---------------------------------------------------------------------------

class TestOutputFormat:
    def test_five_columns(self, tmp_path):
        npy = _make_npy(tmp_path, (30, 2))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        assert result.shape == (30, 5)

    def test_row_count_matches_input(self, tmp_path):
        for n in (1, 10, 100):
            npy = _make_npy(tmp_path, (n, 2), seed=n)
            out = tmp_path / f"out_{n}.txt"
            convert(npy, out, dpi=10.0)
            result = np.loadtxt(out)
            if result.ndim == 1:
                result = result[np.newaxis, :]
            assert len(result) == n

    def test_four_column_input_accepted(self, tmp_path):
        npy = _make_npy(tmp_path, (20, 4))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        assert result.shape == (20, 5)

    def test_no_nan_in_output(self, tmp_path):
        npy = _make_npy(tmp_path, (25, 2))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        assert np.all(np.isfinite(result))


# ---------------------------------------------------------------------------
# Timestamps
# ---------------------------------------------------------------------------

class TestTimestamps:
    def test_default_timestamps_are_row_index(self, tmp_path):
        npy = _make_npy(tmp_path, (10, 2))
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0)
        result = np.loadtxt(out)
        np.testing.assert_allclose(result[:, 0], np.arange(10))

    def test_explicit_timestamps_used(self, tmp_path):
        npy = _make_npy(tmp_path, (5, 2))
        ts  = np.array([0.0, 0.1, 0.2, 0.3, 0.4])
        out = tmp_path / "out.txt"
        convert(npy, out, dpi=10.0, timestamps=ts)
        result = np.loadtxt(out)
        np.testing.assert_allclose(result[:, 0], ts)

    def test_timestamp_length_mismatch_raises(self, tmp_path):
        npy = _make_npy(tmp_path, (10, 2))
        ts  = np.arange(5, dtype=np.float64)
        out = tmp_path / "out.txt"
        with pytest.raises(ValueError, match="timestamps length"):
            convert(npy, out, dpi=10.0, timestamps=ts)


# ---------------------------------------------------------------------------
# File system
# ---------------------------------------------------------------------------

class TestFileSystem:
    def test_creates_parent_dirs(self, tmp_path):
        npy = _make_npy(tmp_path, (10, 2))
        out = tmp_path / "deep" / "nested" / "out.txt"
        convert(npy, out, dpi=10.0)
        assert out.exists()

    def test_output_file_created(self, tmp_path):
        npy = _make_npy(tmp_path, (10, 2))
        out = tmp_path / "result.txt"
        assert not out.exists()
        convert(npy, out, dpi=10.0)
        assert out.exists()
