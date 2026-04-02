"""
Noise injection engine (issue #6).

Takes clean A* ground-truth paths and injects real VIO drift from the noise
library (issue #3) to produce realistic (x, y) columns for NILOC training.

Pipeline position
-----------------
  A* GT paths  ->  [optional junction smoothing, #8]
               ->  inject_noise (this module)
               ->  output formatter (#9)

Coordinate convention
---------------------
In universityA .txt files the columns are ts, x, y, gt_x, gt_y where:
  gt_x = row index into the floorplan image  (height dimension)
  gt_y = col index into the floorplan image  (width dimension)

Noise is computed as (x - gt_x, y - gt_y) — a relative offset that is valid
regardless of axis convention. Noise values can be negative: real VIO systems
perform loop closure and recalibration events that pull the estimate back past
ground truth. This module works entirely with relative offsets and is
unaffected by the row/col convention.

Public API
----------
  load_noise_library(path) -> (segments, meta)
  inject(gt_xy, segments, target_dpi, source_dpi, rng) -> (noisy_xy, segment_idx)
  fabricate(gt_paths, segments, n_out, aug_mult, target_dpi, source_dpi, rng)
      -> list of (ts, noisy_xy, gt_xy, segment_idx)
"""

import json
from pathlib import Path

import numpy as np

SOURCE_DPI = 2.5   # universityA px/m — noise library was built at this DPI
AVALON_DPI = 10.0  # Avalon 2nd floor px/m — physically measured (Ana's commit 260a09a)

# ---------------------------------------------------------------------------
# Library loading
# ---------------------------------------------------------------------------

def load_noise_library(
    npy_path: Path,
) -> tuple[np.ndarray, list[dict]]:
    """
    Load noise library produced by build_noise_library.py.

    Returns
    -------
    segments : (N, window_size, 2) float32
    meta     : list of N dicts with provenance and drift statistics
    """
    npy_path = Path(npy_path)
    segments = np.load(npy_path)
    meta_path = npy_path.with_name(npy_path.stem + '_meta.json')
    meta = json.loads(meta_path.read_text())['segments'] if meta_path.exists() else []
    return segments, meta


# ---------------------------------------------------------------------------
# Core injection
# ---------------------------------------------------------------------------

def _tile_segment(segment: np.ndarray, n_frames: int) -> np.ndarray:
    """
    Extend a noise segment to cover n_frames by tiling with drift continuity.

    Each tiled copy is shifted by the final drift of the previous copy so
    the noise signal remains continuous across tile boundaries.

    Parameters
    ----------
    segment : (window_size, 2)
    n_frames : target length

    Returns
    -------
    tiled : (n_frames, 2)
    """
    window = len(segment)
    if n_frames <= window:
        return segment[:n_frames]

    tiles = [segment]
    offset = segment[-1].copy()  # drift at end of first tile
    remaining = n_frames - window

    while remaining > 0:
        take = min(window, remaining)
        tile = segment[:take] + offset
        tiles.append(tile)
        offset = tile[-1].copy()
        remaining -= take

    return np.concatenate(tiles, axis=0)


def inject(
    gt_xy: np.ndarray,
    segments: np.ndarray,
    target_dpi: float,
    source_dpi: float = SOURCE_DPI,
    rng: np.random.Generator = None,
) -> tuple[np.ndarray, int]:
    """
    Inject a randomly sampled noise segment onto a single GT path.

    Parameters
    ----------
    gt_xy      : (T, 2) clean ground-truth x, y in target floorplan pixels
    segments   : (N, window_size, 2) noise library
    target_dpi : px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
    source_dpi : px/m the noise library was extracted at (default 2.5)
    rng        : numpy Generator for reproducibility; created if None

    Returns
    -------
    noisy_xy   : (T, 2)  gt_xy + scaled noise
    seg_idx    : int  index of the segment used (for logging/reproducibility)
    """
    if rng is None:
        rng = np.random.default_rng()

    T = len(gt_xy)
    seg_idx = int(rng.integers(len(segments)))
    raw_seg = segments[seg_idx]  # (window_size, 2)

    # Tile or truncate to match GT path length
    noise = _tile_segment(raw_seg, T)  # (T, 2)

    # Scale from source DPI to target DPI
    scale = target_dpi / source_dpi
    noise_scaled = noise * scale

    noisy_xy = gt_xy + noise_scaled
    return noisy_xy, seg_idx


# ---------------------------------------------------------------------------
# Batch fabrication
# ---------------------------------------------------------------------------

def fabricate(
    gt_paths: list[np.ndarray],
    segments: np.ndarray,
    n_out: int,
    aug_mult: int,
    target_dpi: float,
    source_dpi: float = SOURCE_DPI,
    rng: np.random.Generator = None,
) -> list[dict]:
    """
    Fabricate n_out noisy trajectories from a pool of GT paths.

    GT paths are sampled with replacement, then each path receives aug_mult
    independent noise injections so a single GT path contributes multiple
    output trajectories with different noise realizations.

    Parameters
    ----------
    gt_paths  : list of (T_i, 5) arrays — columns: ts, x, y, gt_x, gt_y
                (A* output format; x==gt_x at this stage)
    segments  : (N, window_size, 2) noise library
    n_out     : total number of fabricated trajectories to produce
    aug_mult  : noise samples per GT path (augmentation multiplier)
    target_dpi: px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
    source_dpi: px/m of the noise library source
    rng       : numpy Generator

    Returns
    -------
    list of dicts, each with:
        'ts'          : (T,)   timestamps in seconds
        'noisy_xy'    : (T, 2) VIO-noisy x, y
        'gt_xy'       : (T, 2) clean ground truth x, y
        'seg_idx'     : int    noise segment used
        'gt_path_idx' : int    source GT path index
    """
    if rng is None:
        rng = np.random.default_rng()

    results = []
    n_gt = len(gt_paths)

    for out_i in range(n_out):
        gt_path_idx = int(rng.integers(n_gt))
        traj = gt_paths[gt_path_idx]

        ts    = traj[:, 0]
        gt_xy = traj[:, 3:5]   # gt_x, gt_y — clean A* ground truth

        # aug_mult independent injections per GT path; cycle through them
        aug_i = out_i % aug_mult
        child_rng = np.random.default_rng(rng.integers(2**31) + aug_i)

        noisy_xy, seg_idx = inject(
            gt_xy, segments,
            target_dpi=target_dpi,
            source_dpi=source_dpi,
            rng=child_rng,
        )

        results.append({
            'ts':           ts,
            'noisy_xy':     noisy_xy,
            'gt_xy':        gt_xy,
            'seg_idx':      seg_idx,
            'gt_path_idx':  gt_path_idx,
        })

    return results


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate(results: list[dict]) -> list[str]:
    """
    Check fabricated trajectories for correctness.

    Returns a list of error strings; empty list means all checks passed.
    """
    errors = []
    for i, r in enumerate(results):
        noisy = r['noisy_xy']
        gt    = r['gt_xy']

        if np.any(np.isnan(noisy)) or np.any(np.isinf(noisy)):
            errors.append(f'traj {i}: NaN or Inf in noisy_xy')

        if np.allclose(noisy, gt):
            errors.append(f'traj {i}: noisy_xy == gt_xy (noise not applied)')

        mean_drift = np.mean(np.linalg.norm(noisy - gt, axis=1))
        if mean_drift == 0:
            errors.append(f'traj {i}: mean drift is zero')

    return errors
