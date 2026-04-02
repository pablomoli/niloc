"""Tests for preprocess/synthetic_data/inject_noise.py."""

import json
import tempfile
from pathlib import Path

import numpy as np

from preprocess.synthetic_data.inject_noise import (
    AVALON_DPI,
    SOURCE_DPI,
    _build_noise,
    fabricate,
    inject,
    load_noise_library,
    validate,
)

# ---------------------------------------------------------------------------
# _build_noise
# ---------------------------------------------------------------------------


class TestBuildNoise:
    def test_shorter_than_window_truncates(self, noise_segments: np.ndarray) -> None:
        window = noise_segments.shape[1]
        noise, _ = _build_noise(noise_segments, window // 2, np.random.default_rng(0))
        assert noise.shape == (window // 2, 2)

    def test_exact_window_length(self, noise_segments: np.ndarray) -> None:
        window = noise_segments.shape[1]
        noise, _ = _build_noise(noise_segments, window, np.random.default_rng(0))
        assert noise.shape == (window, 2)

    def test_longer_than_window_extends(self, noise_segments: np.ndarray) -> None:
        window = noise_segments.shape[1]
        noise, _ = _build_noise(noise_segments, window * 3, np.random.default_rng(0))
        assert noise.shape == (window * 3, 2)

    def test_no_nan_or_inf(self, noise_segments: np.ndarray) -> None:
        noise, _ = _build_noise(noise_segments, 500, np.random.default_rng(1))
        assert np.all(np.isfinite(noise))

    def test_seg_idx_in_range(self, noise_segments: np.ndarray) -> None:
        _, seg_idx = _build_noise(noise_segments, 100, np.random.default_rng(2))
        assert 0 <= seg_idx < len(noise_segments)

    def test_reproducible_with_same_rng(self, noise_segments: np.ndarray) -> None:
        n1, _ = _build_noise(noise_segments, 300, np.random.default_rng(42))
        n2, _ = _build_noise(noise_segments, 300, np.random.default_rng(42))
        np.testing.assert_array_equal(n1, n2)

    def test_continuous_at_tile_boundaries(self, noise_segments: np.ndarray) -> None:
        """Frame-to-frame steps at tile seams must not be sudden hard resets."""
        window = noise_segments.shape[1]
        noise, _ = _build_noise(noise_segments, window * 3, np.random.default_rng(5))
        diffs = np.linalg.norm(np.diff(noise, axis=0), axis=1)
        typical = np.median(diffs)
        # boundary frames: last frame before each tile boundary
        for boundary in [window - 1, 2 * window - 1]:
            assert diffs[boundary] < typical * 20, (
                f"Discontinuity at tile boundary {boundary}: "
                f"{diffs[boundary]:.2f} vs median {typical:.2f}"
            )

    def test_independent_segments_can_reverse_drift(
        self, noise_segments: np.ndarray
    ) -> None:
        """Independent segment draws allow drift to reverse; old same-segment
        tiling always grew monotonically."""
        window = noise_segments.shape[1]
        noise, _ = _build_noise(noise_segments, window * 6, np.random.default_rng(99))
        drift_at_tile_end = [
            float(np.linalg.norm(noise[min((i + 1) * window - 1, len(noise) - 1)]))
            for i in range(6)
        ]
        monotone = all(
            drift_at_tile_end[i] <= drift_at_tile_end[i + 1]
            for i in range(len(drift_at_tile_end) - 1)
        )
        assert not monotone, (
            "Drift never reversed across tiles — independent segment draws "
            "should occasionally reduce drift, not always grow it"
        )


# ---------------------------------------------------------------------------
# inject
# ---------------------------------------------------------------------------


class TestInject:
    def test_output_shape_matches_gt(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((120, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (120, 2)

    def test_noise_is_applied(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((120, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert not np.allclose(noisy_xy, gt_xy)

    def test_no_nan_or_inf(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.ones((120, 2)) * 100.0
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert np.all(np.isfinite(noisy_xy))

    def test_dpi_scaling_applied(self, noise_segments: np.ndarray) -> None:
        """Noise magnitude must scale linearly with target_dpi."""
        gt_xy = np.zeros((120, 2))
        noisy_1x, _idx = inject(gt_xy, noise_segments, target_dpi=2.5,
                                rng=np.random.default_rng(0))
        noisy_2x, _ = inject(gt_xy, noise_segments, target_dpi=5.0,
                             rng=np.random.default_rng(0))
        drift_1x = np.linalg.norm(noisy_1x, axis=1).mean()
        drift_2x = np.linalg.norm(noisy_2x, axis=1).mean()
        np.testing.assert_allclose(drift_2x / drift_1x, 2.0, rtol=1e-4)

    def test_avalon_dpi_scale_factor(self, noise_segments: np.ndarray) -> None:
        """AVALON_DPI / SOURCE_DPI must equal 4.0 — Ana's physically measured value."""
        assert AVALON_DPI == 10.0, f"AVALON_DPI changed: expected 10.0, got {AVALON_DPI}"
        assert SOURCE_DPI == 2.5, f"SOURCE_DPI changed: expected 2.5, got {SOURCE_DPI}"
        assert AVALON_DPI / SOURCE_DPI == 4.0

    def test_seg_idx_in_valid_range(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((120, 2))
        _, seg_idx = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert 0 <= seg_idx < len(noise_segments)

    def test_short_path_handled(self, noise_segments: np.ndarray) -> None:
        """GT path shorter than noise window must truncate without error."""
        window = noise_segments.shape[1]
        gt_xy = np.zeros((window // 3, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (window // 3, 2)

    def test_long_path_tiled(self, noise_segments: np.ndarray) -> None:
        """GT path longer than noise window must tile without error."""
        window = noise_segments.shape[1]
        gt_xy = np.zeros((window * 4, 2))
        noisy_xy, _ = inject(gt_xy, noise_segments, target_dpi=3.5)
        assert noisy_xy.shape == (window * 4, 2)
        assert np.all(np.isfinite(noisy_xy))

    def test_rng_reproducibility(self, noise_segments: np.ndarray) -> None:
        gt_xy = np.zeros((120, 2))
        noisy_a, _ = inject(gt_xy, noise_segments, target_dpi=3.5,
                            rng=np.random.default_rng(7))
        noisy_b, _ = inject(gt_xy, noise_segments, target_dpi=3.5,
                            rng=np.random.default_rng(7))
        np.testing.assert_array_equal(noisy_a, noisy_b)


# ---------------------------------------------------------------------------
# fabricate
# ---------------------------------------------------------------------------


class TestFabricate:
    def test_output_count(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=20, aug_mult=2, target_dpi=3.5)
        assert len(results) == 20

    def test_result_keys(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=1, aug_mult=1, target_dpi=3.5)
        assert set(results[0].keys()) == {"ts", "noisy_xy", "gt_xy", "seg_idx", "gt_path_idx"}

    def test_gt_path_idx_in_range(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=40, aug_mult=1, target_dpi=3.5)
        for r in results:
            assert 0 <= r["gt_path_idx"] < len(gt_paths)

    def test_shapes_match_gt(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=16, aug_mult=1, target_dpi=3.5)
        for r in results:
            T = len(r["ts"])
            assert r["noisy_xy"].shape == (T, 2)
            assert r["gt_xy"].shape == (T, 2)

    def test_reproducibility_with_seed(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        r1 = fabricate(gt_paths, noise_segments, n_out=10, aug_mult=1,
                       target_dpi=3.5, rng=np.random.default_rng(0))
        r2 = fabricate(gt_paths, noise_segments, n_out=10, aug_mult=1,
                       target_dpi=3.5, rng=np.random.default_rng(0))
        for a, b in zip(r1, r2):
            np.testing.assert_array_equal(a["noisy_xy"], b["noisy_xy"])

    def test_no_nan_in_any_result(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=20, aug_mult=1, target_dpi=3.5)
        for r in results:
            assert np.all(np.isfinite(r["noisy_xy"]))

    def test_noise_applied_to_all_results(
        self, gt_paths: list[np.ndarray], noise_segments: np.ndarray
    ) -> None:
        results = fabricate(gt_paths, noise_segments, n_out=20, aug_mult=1, target_dpi=3.5)
        for r in results:
            assert not np.allclose(r["noisy_xy"], r["gt_xy"])


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------


class TestValidate:
    def _make_result(self, noisy_xy: np.ndarray, gt_xy: np.ndarray) -> dict:
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
        assert validate([self._make_result(noisy, gt)]) == []

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

    def test_multiple_trajectories_all_checked(self) -> None:
        good = np.ones((100, 2)) * 5.0
        gt = np.zeros((100, 2))
        bad = gt.copy()
        bad[0, 0] = np.nan
        results = [
            self._make_result(good, gt),
            self._make_result(bad, gt),
            self._make_result(good, gt),
        ]
        errors = validate(results)
        assert len(errors) == 1


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
