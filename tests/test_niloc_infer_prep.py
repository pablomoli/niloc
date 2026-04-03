"""Tests for preprocess.inference.niloc_infer_prep."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from preprocess.inference.niloc_infer_prep import resample


def _make_txt(tmp_path: Path, n_rows: int, source_hz: float = 200.0) -> Path:
    """Write a synthetic niloc_input .txt file at source_hz."""
    p = tmp_path / "session.txt"
    rng = np.random.default_rng(0)
    ts = np.arange(n_rows, dtype=np.float64)
    vio_x = np.cumsum(rng.uniform(0.0, 0.1, n_rows))
    vio_y = np.cumsum(rng.uniform(0.0, 0.1, n_rows))
    gt_x = np.zeros(n_rows)
    gt_y = np.zeros(n_rows)
    data = np.stack([ts, vio_x, vio_y, gt_x, gt_y], axis=-1)
    np.savetxt(p, data, fmt="%.6f", delimiter=" ")
    return p


class TestResample:
    def test_output_row_count(self, tmp_path):
        # 600 rows at 200 Hz → 3 rows at 1 Hz (indices 0, 200, 400)
        src = _make_txt(tmp_path, 600)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        assert result.shape == (3, 5)

    def test_timestamps_in_seconds(self, tmp_path):
        # Row indices 0, 200, 400 at 200 Hz → 0.0, 1.0, 2.0 seconds
        src = _make_txt(tmp_path, 600)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        np.testing.assert_allclose(result[:, 0], [0.0, 1.0, 2.0])

    def test_positions_match_source_rows(self, tmp_path):
        # vio_x/y at output rows should match source rows 0, 200, 400
        src = _make_txt(tmp_path, 600)
        source = np.loadtxt(src)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        np.testing.assert_allclose(result[:, 1], source[[0, 200, 400], 1])
        np.testing.assert_allclose(result[:, 2], source[[0, 200, 400], 2])

    def test_gt_columns_preserved(self, tmp_path):
        # gt_x, gt_y (zeros at inference time) should be preserved
        src = _make_txt(tmp_path, 400)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        np.testing.assert_array_equal(result[:, 3], 0.0)
        np.testing.assert_array_equal(result[:, 4], 0.0)

    def test_output_has_five_columns(self, tmp_path):
        src = _make_txt(tmp_path, 400)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        assert result.ndim == 2
        assert result.shape[1] == 5

    def test_creates_parent_dirs(self, tmp_path):
        src = _make_txt(tmp_path, 200)
        out = tmp_path / "subdir" / "deep" / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        assert out.exists()

    def test_partial_last_second_excluded(self, tmp_path):
        # 250 rows at 200 Hz: only index 0 and 200 are complete seconds
        src = _make_txt(tmp_path, 250)
        out = tmp_path / "out.txt"
        resample(src, out, source_hz=200.0, target_hz=1.0)
        result = np.loadtxt(out)
        assert result.shape[0] == 2


class TestCLI:
    def test_processes_all_txt_files_in_dir(self, tmp_path):
        in_dir = tmp_path / "in"
        out_dir = tmp_path / "out"
        in_dir.mkdir()
        rng = np.random.default_rng(42)
        for name in ("s1", "s2"):
            ts = np.arange(400, dtype=np.float64)
            xy = np.cumsum(rng.uniform(0, 0.1, (400, 2)), axis=0)
            zeros = np.zeros((400, 2))
            data = np.concatenate([ts[:, None], xy, zeros], axis=1)
            np.savetxt(in_dir / f"{name}.txt", data, fmt="%.6f", delimiter=" ")
        from preprocess.inference.niloc_infer_prep import main
        main(["--input-dir", str(in_dir), "--output-dir", str(out_dir), "--source-hz", "200"])
        assert (out_dir / "s1.txt").exists()
        assert (out_dir / "s2.txt").exists()
