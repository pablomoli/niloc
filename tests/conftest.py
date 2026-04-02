"""Shared fixtures for the fabrication pipeline test suite."""

import numpy as np
import pytest


def _make_gt_path(n_frames: int = 500, seed: int = 0) -> np.ndarray:
    """
    Synthetic A* output: ts, x, y, gt_x, gt_y where x == gt_x (no noise yet).
    Trajectory walks in a slow drift so it resembles a real corridor path.
    """
    rng = np.random.default_rng(seed)
    ts = np.arange(n_frames, dtype=float)
    dx = np.cumsum(rng.normal(0.5, 0.1, n_frames))
    dy = np.cumsum(rng.normal(0.1, 0.05, n_frames))
    gt_x = dx
    gt_y = dy
    # A* output has x == gt_x before noise injection
    return np.stack([ts, gt_x, gt_y, gt_x, gt_y], axis=1)


def _make_noise_library(
    n_segments: int = 50,
    window: int = 400,
    seed: int = 42,
) -> np.ndarray:
    """Synthetic noise library: random-walk segments normalized to (0,0)."""
    rng = np.random.default_rng(seed)
    # Random-walk increments to mimic autocorrelated VIO drift
    increments = rng.normal(0, 0.5, (n_segments, window, 2))
    segments = np.cumsum(increments, axis=1).astype(np.float32)
    # Normalize to start at (0, 0)
    segments -= segments[:, :1, :]
    return segments


@pytest.fixture()
def noise_segments() -> np.ndarray:
    return _make_noise_library()


@pytest.fixture()
def gt_paths() -> list[np.ndarray]:
    return [_make_gt_path(n_frames=n, seed=i) for i, n in enumerate([400, 600, 1000])]


@pytest.fixture()
def short_gt_path() -> np.ndarray:
    return _make_gt_path(n_frames=200)


@pytest.fixture()
def long_gt_path() -> np.ndarray:
    return _make_gt_path(n_frames=1200)
