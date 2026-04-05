"""Tests for motion-typed noise injection (issue #17)."""

from __future__ import annotations

import numpy as np

from preprocess.synthetic_data.inject_noise import (
    MOTION_STATIONARY,
    MOTION_STRAIGHT,
    MOTION_TURN,
    build_buckets,
    classify_path_motion,
    fabricate,
    inject,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _straight_path(n: int = 80, speed_px_s: float = 5.0, dpi: float = 10.0) -> np.ndarray:
    """GT path moving steadily in one direction — should classify as straight."""
    rows = np.arange(n, dtype=float) * speed_px_s
    cols = np.zeros(n)
    return np.column_stack([rows, cols])


def _turning_path(n: int = 80, dpi: float = 10.0) -> np.ndarray:
    """GT path with frequent sharp 90° corners — high p90 heading change."""
    # Walk in a zigzag: alternate direction every 4 steps so that >20% of
    # transitions are 90° turns — well above the p90 threshold of 20°.
    rows, cols = [0.0], [0.0]
    for i in range(1, n):
        segment = i // 4
        if segment % 2 == 0:
            rows.append(rows[-1] + 5.0)
            cols.append(cols[-1])
        else:
            rows.append(rows[-1])
            cols.append(cols[-1] + 5.0)
    return np.column_stack([rows, cols])


def _stationary_path(n: int = 80, dpi: float = 10.0) -> np.ndarray:
    """GT path barely moving — should classify as stationary."""
    noise = np.random.default_rng(0).normal(0, 0.01, (n, 2))
    return noise  # near (0, 0) in pixels


def _fake_segments(n: int = 50, window: int = 150) -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.normal(0, 1.0, (n, window, 2)).astype(np.float32)


def _fake_meta(n: int = 50, motion_type: str = MOTION_STRAIGHT) -> list[dict]:
    return [{"motion_type": motion_type, "mean_drift": 1.0} for _ in range(n)]


# ---------------------------------------------------------------------------
# classify_path_motion
# ---------------------------------------------------------------------------


class TestClassifyPathMotion:
    DPI = 10.0

    def test_straight_path(self) -> None:
        path = _straight_path(dpi=self.DPI)
        result = classify_path_motion(path, target_dpi=self.DPI)
        assert result == MOTION_STRAIGHT

    def test_turning_path(self) -> None:
        path = _turning_path(dpi=self.DPI)
        result = classify_path_motion(path, target_dpi=self.DPI)
        assert result == MOTION_TURN

    def test_stationary_path(self) -> None:
        path = _stationary_path(dpi=self.DPI)
        result = classify_path_motion(path, target_dpi=self.DPI)
        assert result == MOTION_STATIONARY

    def test_returns_string(self) -> None:
        path = _straight_path(dpi=self.DPI)
        result = classify_path_motion(path, target_dpi=self.DPI)
        assert isinstance(result, str)
        assert result in (MOTION_STRAIGHT, MOTION_TURN, MOTION_STATIONARY)

    def test_single_frame_path(self) -> None:
        # Paths with only one frame can't compute heading; must not crash.
        path = np.array([[0.0, 0.0], [0.5, 0.0]])
        result = classify_path_motion(path, target_dpi=self.DPI)
        assert result in (MOTION_STRAIGHT, MOTION_STATIONARY)


# ---------------------------------------------------------------------------
# build_buckets
# ---------------------------------------------------------------------------


class TestBuildBuckets:
    def test_returns_correct_indices(self) -> None:
        meta = (
            _fake_meta(20, MOTION_STRAIGHT)
            + _fake_meta(30, MOTION_TURN)
            + _fake_meta(5, MOTION_STATIONARY)
        )
        buckets = build_buckets(meta)
        assert set(buckets[MOTION_STRAIGHT]) == set(range(20))
        assert set(buckets[MOTION_TURN]) == set(range(20, 50))

    def test_small_bucket_excluded(self) -> None:
        # Stationary has 5 segments < _MIN_BUCKET_SIZE=10 → excluded.
        meta = (
            _fake_meta(20, MOTION_STRAIGHT)
            + _fake_meta(5, MOTION_STATIONARY)
        )
        buckets = build_buckets(meta)
        assert MOTION_STATIONARY not in buckets

    def test_indices_are_numpy_arrays(self) -> None:
        meta = _fake_meta(20, MOTION_STRAIGHT) + _fake_meta(20, MOTION_TURN)
        buckets = build_buckets(meta)
        for v in buckets.values():
            assert isinstance(v, np.ndarray)

    def test_empty_meta(self) -> None:
        assert build_buckets([]) == {}

    def test_missing_motion_type_defaults_to_straight(self) -> None:
        meta = [{"mean_drift": 1.0}] * 20  # no motion_type key
        buckets = build_buckets(meta)
        assert MOTION_STRAIGHT in buckets
        assert len(buckets[MOTION_STRAIGHT]) == 20


# ---------------------------------------------------------------------------
# inject with buckets
# ---------------------------------------------------------------------------


class TestInjectWithBuckets:
    DPI = 10.0

    def _all_straight_buckets(self, n: int = 50) -> dict[str, np.ndarray]:
        return {MOTION_STRAIGHT: np.arange(n, dtype=np.intp)}

    def test_inject_returns_correct_shape(self) -> None:
        segs = _fake_segments(50)
        gt = _straight_path(n=60, dpi=self.DPI)
        buckets = self._all_straight_buckets()
        noisy, seg_idx = inject(gt, segs, self.DPI, rng=np.random.default_rng(0),
                                buckets=buckets)
        assert noisy.shape == gt.shape

    def test_inject_differs_from_gt(self) -> None:
        segs = _fake_segments(50)
        gt = _straight_path(n=60, dpi=self.DPI)
        buckets = self._all_straight_buckets()
        noisy, _ = inject(gt, segs, self.DPI, rng=np.random.default_rng(0),
                          buckets=buckets)
        assert not np.allclose(noisy, gt)

    def test_fallback_when_bucket_missing(self) -> None:
        # Buckets has no MOTION_TURN entry; a turning path should fall back
        # to full library without error.
        segs = _fake_segments(50)
        gt = _turning_path(n=60, dpi=self.DPI)
        buckets = {MOTION_STRAIGHT: np.arange(50, dtype=np.intp)}
        noisy, seg_idx = inject(gt, segs, self.DPI, rng=np.random.default_rng(0),
                                buckets=buckets)
        assert noisy.shape == gt.shape
        assert 0 <= seg_idx < len(segs)

    def test_no_buckets_behaves_as_before(self) -> None:
        segs = _fake_segments(50)
        gt = _straight_path(n=60, dpi=self.DPI)
        noisy, _ = inject(gt, segs, self.DPI, rng=np.random.default_rng(0))
        assert noisy.shape == gt.shape


# ---------------------------------------------------------------------------
# fabricate with meta
# ---------------------------------------------------------------------------


class TestFabricateWithMeta:
    DPI = 10.0

    def _gt_paths(self, n: int = 10) -> list[np.ndarray]:
        paths = []
        for _ in range(n):
            path = _straight_path(n=80, dpi=self.DPI)
            ts = np.arange(80, dtype=float)
            arr = np.column_stack([ts, path, path])  # (80, 5)
            paths.append(arr)
        return paths

    def test_motion_typed_fabrication_runs(self) -> None:
        segs = _fake_segments(50)
        meta = _fake_meta(50, MOTION_STRAIGHT)
        gt_paths = self._gt_paths()
        results = fabricate(
            gt_paths=gt_paths, segments=segs, n_out=5,
            aug_mult=2, target_dpi=self.DPI,
            rng=np.random.default_rng(0),
            meta=meta, freq=1.0,
        )
        assert len(results) == 5
        for r in results:
            assert r["noisy_xy"].shape == r["gt_xy"].shape

    def test_fabricate_without_meta_unchanged(self) -> None:
        segs = _fake_segments(50)
        gt_paths = self._gt_paths()
        results = fabricate(
            gt_paths=gt_paths, segments=segs, n_out=5,
            aug_mult=2, target_dpi=self.DPI,
            rng=np.random.default_rng(0),
        )
        assert len(results) == 5
