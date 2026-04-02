"""Shared fixtures for the fabrication pipeline test suite."""

import numpy as np
import pytest

# Noise window sized for Avalon sessions (shorter building, shorter walks)
NOISE_WINDOW = 150


def _make_gt_path(n_frames: int = 150, seed: int = 0) -> np.ndarray:
    """
    Synthetic A* output: ts, x, y, gt_x, gt_y where x == gt_x (no noise yet).
    Trajectory walks with a slow drift so it resembles a real corridor path.
    """
    rng = np.random.default_rng(seed)
    ts = np.arange(n_frames, dtype=float)
    dx = np.cumsum(rng.normal(0.5, 0.1, n_frames))
    dy = np.cumsum(rng.normal(0.1, 0.05, n_frames))
    gt_x = dx
    gt_y = dy
    return np.stack([ts, gt_x, gt_y, gt_x, gt_y], axis=1)


def _make_noise_library(
    n_segments: int = 200,
    window: int = NOISE_WINDOW,
    seed: int = 42,
) -> np.ndarray:
    """Synthetic noise library: random-walk segments normalized to (0,0)."""
    rng = np.random.default_rng(seed)
    increments = rng.normal(0, 0.5, (n_segments, window, 2))
    segments = np.cumsum(increments, axis=1).astype(np.float32)
    segments -= segments[:, :1, :]
    return segments


@pytest.fixture()
def noise_segments() -> np.ndarray:
    return _make_noise_library()


@pytest.fixture()
def gt_paths() -> list[np.ndarray]:
    lengths = [60, 80, 100, 120, 150, 150, 200, 300]
    return [_make_gt_path(n_frames=n, seed=i) for i, n in enumerate(lengths)]


@pytest.fixture()
def short_gt_path() -> np.ndarray:
    return _make_gt_path(n_frames=50)


@pytest.fixture()
def long_gt_path() -> np.ndarray:
    return _make_gt_path(n_frames=500)
