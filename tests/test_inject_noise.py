"""Tests for preprocess/synthetic_data/inject_noise.py."""

import json
import tempfile
from pathlib import Path

import numpy as np
import pytest

from preprocess.synthetic_data.inject_noise import (
    _tile_segment,
    fabricate,
    inject,
    load_noise_library,
    validate,
)


# ---------------------------------------------------------------------------
# _tile_segment
# ---------------------------------------------------------------------------


class TestTileSegment:
    def test_shorter_than_window_truncates(self) -> None:
        seg = np.ones((400, 2), dtype=np.float32)
        result = _tile_segment(seg, 200)
        assert result.shape == (200, 2)

    def test_exact_length_returns_copy(self) -> None:
        seg = np.arange(800, dtype=np.float32).reshape(400, 2)
        result = _tile_segment(seg, 400)
        assert result.shape == (400, 2)
        np.testing.assert_array_equal(result, seg)

    def test_tiling_extends_to_target_length(self) -> None:
        seg = np.ones((400, 2), dtype=np.float32)
        result = _tile_segment(seg, 900)
        assert result.shape == (900, 2)

    def test_tiling_is_continuous_at_boundary(self) -> None:
        """Jump at tile boundary must equal final drift of preceding tile."""
        rng = np.random.default_rng(0)
        seg = np.cumsum(rng.normal(0, 1, (400, 2)), axis=0).astype(np.float32)
        result = _tile_segment(seg, 800)

        # The value at frame 400 should be seg[0] + seg[-1] (offset by final drift)
        expected_start_of_second_tile = seg[-1] + seg[0]
        np.testing.assert_allclose(result[400], expected_start_of_second_tile, rtol=1e-5)

    def test_no_discontinuity_across_tiles(self) -> None:
        """Frame-to-frame jumps at tile seams must not exceed 2x the max within-segment jump."""
        rng = np.random.default_rng(1)
        seg = np.cumsum(rng.normal(0, 0.3, (400, 2)), axis=0).astype(np.float32)
        result = _tile_segment(seg, 1200)
        diffs = np.linalg.norm(np.diff(result, axis=0), axis=1)
        within_seg_max = np.linalg.norm(np.diff(seg, axis=0), axis=1).max()
        # Seam jumps should be comparable to within-segment steps, not sudden resets
        assert diffs.max() < within_seg_max * 3


# ---------------------------------------------------------------------------
# inject
# ---------------------------------------------------------------------------


class TestInject:
    def test_output_shape_matches_gt(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((500, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (500, 2)

    def test_noise_is_applied(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((500, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert not np.allclose(noisy_xy, gt_xy)

    def test_no_nan_or_inf(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.ones((500, 2)) * 100.0
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert np.all(np.isfinite(noisy_xy))

    def test_dpi_scaling_applied(self, noise_segments: np.ndarray) -> None:
        """Noise magnitude should scale linearly with target_dpi."""
        gt_xy = np.zeros((500, 2))
        rng = np.random.default_rng(0)

        noisy_1x, idx = inject(gt_xy, noise_segments, target_dpi=2.5, rng=rng)
        rng2 = np.random.default_rng(0)
        noisy_2x, _ = inject(gt_xy, noise_segments, target_dpi=5.0, rng=rng2)

        drift_1x = np.linalg.norm(noisy_1x, axis=1).mean()
        drift_2x = np.linalg.norm(noisy_2x, axis=1).mean()
        np.testing.assert_allclose(drift_2x / drift_1x, 2.0, rtol=1e-4)

    def test_seg_idx_in_valid_range(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((500, 2))
        _, seg_idx = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert 0 <= seg_idx < len(noise_segments)

    def test_short_path_handled(self, noise_segments: np.ndarray) -> None:
        """GT path shorter than noise window should truncate without error."""
        gt_xy = np.zeros((150, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (150, 2)

    def test_long_path_tiled(self, noise_segments: np.ndarray) -> None:
        """GT path longer than noise window should tile without error."""
        gt_xy = np.zeros((1200, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (1200, 2)
        assert np.all(np.isfinite(noisy_xy))

    def test_rng_reproducibility(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((500, 2))
        noisy_a, _ = inject(gt_xy, noise_segments, target_dpi=3.5, rng=np.random.default_rng(7))
        noisy_b, _ = inject(gt_xy, noise_segments, target_dpi=3.5, rng=np.random.default_rng(7))
        np.testing.assert_array_equal(noisy_a, noisy_b)


# ---------------------------------------------------------------------------
# fabricate
# ---------------------------------------------------------------------------


class TestFabricate:
    def test_output_count(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=10, aug_mult=2, target_dpi=3.5)
        assert len(results) == 10

    def test_result_keys(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=1, aug_mult=1, target_dpi=3.5)
        assert set(results[0].keys()) == {"ts", "noisy_xy", "gt_xy", "seg_idx", "gt_path_idx"}

    def test_gt_path_idx_in_range(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=20, aug_mult=1, target_dpi=3.5)
        for r in results:
            assert 0 <= r["gt_path_idx"] < len(gt_paths)

    def test_shapes_match_gt(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=6, aug_mult=1, target_dpi=3.5)
        for r in results:
            T = len(r["ts"])
            assert r["noisy_xy"].shape == (T, 2)
            assert r["gt_xy"].shape == (T, 2)

    def test_reproducibility_with_seed(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        r1 = fabricate(gt_paths, noise_segments, n_out=5, aug_mult=1,
                       target_dpi=3.5, rng=np.random.default_rng(0))
        r2 = fabricate(gt_paths, noise_segments, n_out=5, aug_mult=1,
                       target_dpi=3.5, rng=np.random.default_rng(0))
        for a, b in zip(r1, r2):
            np.testing.assert_array_equal(a["noisy_xy"], b["noisy_xy"])


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------


class TestValidate:
    def _make_result(
        self,
        noisy_xy: np.ndarray,
        gt_xy: np.ndarray,
    ) -> dict:
        return {
            "ts": np.arange(len(gt_xy), dtype=float),
            "noisy_xy": noisy_xy,
            "gt_xy": gt_xy,
            "seg_idx": 0,
            "gt_path_idx": 0,
        }

    def test_valid_result_passes(self) -> None:
        gt = np.zeros((100, 2))
        noisy = gt + 5.0
        errors = validate([self._make_result(noisy, gt)])
        assert errors == []

    def test_nan_detected(self) -> None:
        gt = np.zeros((100, 2))
        noisy = gt.copy()
        noisy[50, 0] = np.nan
        errors = validate([self._make_result(noisy, gt)])
        assert any("NaN" in e for e in errors)

    def test_inf_detected(self) -> None:
        gt = np.zeros((100, 2))
        noisy = gt.copy()
        noisy[10, 1] = np.inf
        errors = validate([self._make_result(noisy, gt)])
        assert any("Inf" in e for e in errors)

    def test_zero_noise_detected(self) -> None:
        gt = np.ones((100, 2)) * 10.0
        errors = validate([self._make_result(gt.copy(), gt)])
        assert any("noise" in e or "gt_xy" in e for e in errors)


# ---------------------------------------------------------------------------
# load_noise_library
# ---------------------------------------------------------------------------


class TestLoadNoiseLibrary:
    def test_loads_npy_and_meta(self, noise_segments: np.ndarray) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            npy = Path(tmp) / "noise_library.npy"
            meta_path = Path(tmp) / "noise_library_meta.json"
            np.save(npy, noise_segments)
            meta_path.write_text(json.dumps({"segments": [{"source": "a001_1"}]}))

            segs, meta = load_noise_library(npy)

        assert segs.shape == noise_segments.shape
        assert len(meta) == 1

    def test_loads_without_meta_file(self, noise_segments: np.ndarray) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            npy = Path(tmp) / "noise_library.npy"
            np.save(npy, noise_segments)
            segs, meta = load_noise_library(npy)

        assert segs.shape == noise_segments.shape
        assert meta == []
