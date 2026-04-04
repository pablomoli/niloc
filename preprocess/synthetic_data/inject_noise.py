"""
Noise injection engine (issue #6).

Takes clean A* ground-truth paths and injects real VIO drift from the noise
library to produce realistic (x, y) columns for NILOC training.

The noise library stores offsets in **metres**. Injection scales them to the
target floorplan's pixel space by multiplying by ``target_dpi``.

Pipeline position
-----------------
  A* GT paths  ->  [optional junction smoothing, #8]
               ->  inject_noise (this module)
               ->  output formatter (#9)

Coordinate convention
---------------------
Noise values can be negative: real VIO systems perform loop closure and
recalibration events that pull the estimate back past ground truth. This
module works entirely with relative offsets.

Public API
----------
  load_noise_library(path) -> (segments, meta)
  inject(gt_xy, segments, target_dpi, rng) -> (noisy_xy, segment_idx)
  fabricate(gt_paths, segments, n_out, aug_mult, target_dpi, rng)
      -> list of (ts, noisy_xy, gt_xy, segment_idx)
"""

import json
from pathlib import Path

import numpy as np

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

def _build_noise(
    segments: np.ndarray,
    n_frames: int,
    rng: np.random.Generator,
) -> tuple[np.ndarray, int]:
    """
    Build a noise signal of length n_frames from the segment library.

    For paths shorter than or equal to the window, a single randomly chosen
    segment is truncated. For longer paths, independently sampled segments are
    concatenated with a continuity offset so the signal never jumps — each new
    segment is drawn fresh from the library so the drift direction can reverse,
    modelling VIO loop-closure events that pull the estimate back toward GT.

    Parameters
    ----------
    segments : (N, window_size, 2)
    n_frames : desired output length
    rng      : numpy Generator

    Returns
    -------
    noise   : (n_frames, 2)
    seg_idx : int  index of the first segment drawn (for logging)
    """
    window = segments.shape[1]
    seg_idx = int(rng.integers(len(segments)))

    if n_frames <= window:
        return segments[seg_idx, :n_frames].copy(), seg_idx

    chunks: list[np.ndarray] = [segments[seg_idx]]
    offset = segments[seg_idx, -1].copy()
    remaining = n_frames - window

    while remaining > 0:
        take = min(window, remaining)
        new_idx = int(rng.integers(len(segments)))
        chunk = segments[new_idx, :take] + offset
        chunks.append(chunk)
        offset = chunk[-1].copy()
        remaining -= take

    return np.concatenate(chunks, axis=0)[:n_frames], seg_idx


def inject(
    gt_xy: np.ndarray,
    segments: np.ndarray,
    target_dpi: float,
    rng: np.random.Generator = None,
) -> tuple[np.ndarray, int]:
    """
    Inject a randomly sampled noise segment onto a single GT path.

    Parameters
    ----------
    gt_xy      : (T, 2) clean ground-truth x, y in target floorplan pixels
    segments   : (N, window_size, 2) noise library in **metres**
    target_dpi : px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
    rng        : numpy Generator for reproducibility; created if None

    Returns
    -------
    noisy_xy   : (T, 2)  gt_xy + noise_metres * target_dpi
    seg_idx    : int  index of the first segment used (for logging/reproducibility)
    """
    if rng is None:
        rng = np.random.default_rng()

    T = len(gt_xy)
    noise_m, seg_idx = _build_noise(segments, T, rng)
    noisy_xy = gt_xy + noise_m * target_dpi
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
    segments  : (N, window_size, 2) noise library in **metres**
    n_out     : total number of fabricated trajectories to produce
    aug_mult  : noise samples per GT path (augmentation multiplier)
    target_dpi: px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
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

        aug_i = out_i % aug_mult
        child_rng = np.random.default_rng(rng.integers(2**31) + aug_i)

        noisy_xy, seg_idx = inject(
            gt_xy, segments,
            target_dpi=target_dpi,
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
