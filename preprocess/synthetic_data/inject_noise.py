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

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

AVALON_DPI = 10.0  # Avalon 2nd floor px/m — physically measured (Ana's commit 260a09a)

# Motion type labels — must match build_noise_library.classify_segment_motion.
MOTION_STRAIGHT    = "straight"
MOTION_TURN        = "turn"
MOTION_STATIONARY  = "stationary"

# Thresholds for GT path classification (mirrors build_noise_library constants).
_TURN_THRESHOLD_DEG        = 20.0
_STATIONARY_THRESHOLD_M_S  = 0.3
_MIN_BUCKET_SIZE           = 10   # fall back to full library if bucket is smaller

# ---------------------------------------------------------------------------
# Motion type classification
# ---------------------------------------------------------------------------


def classify_path_motion(
    gt_xy_px: np.ndarray,
    target_dpi: float,
    freq: float = 1.0,
) -> str:
    """
    Classify a GT path as 'stationary', 'turn', or 'straight'.

    Uses the same thresholds as build_noise_library.classify_segment_motion so
    that injection buckets are consistent with library construction.

    Parameters
    ----------
    gt_xy_px   : (T, 2) GT positions in floorplan pixels
    target_dpi : pixels per metre of the target floorplan
    freq       : sampling frequency in Hz (default 1.0)

    Returns
    -------
    "stationary" | "turn" | "straight"
    """
    gt_m = gt_xy_px / target_dpi
    dx = np.diff(gt_m[:, 0])
    dy = np.diff(gt_m[:, 1])
    displacements = np.sqrt(dx**2 + dy**2)
    mean_speed = displacements.mean() * freq  # m/s

    if mean_speed < _STATIONARY_THRESHOLD_M_S:
        return MOTION_STATIONARY

    moving = displacements > 1e-6
    if not np.any(moving):
        return MOTION_STATIONARY

    headings = np.arctan2(dy[moving], dx[moving])
    if len(headings) < 2:
        return MOTION_STRAIGHT

    dh = np.abs(np.diff(headings))
    dh = np.minimum(dh, 2 * np.pi - dh)
    # Use p90 so occasional large steps don't override the characteristic motion.
    if np.degrees(np.percentile(dh, 90)) > _TURN_THRESHOLD_DEG:
        return MOTION_TURN

    return MOTION_STRAIGHT


def build_buckets(meta: list[dict]) -> dict[str, np.ndarray]:
    """
    Pre-compute motion-type bucket index arrays from segment metadata.

    Parameters
    ----------
    meta : per-segment metadata list from load_noise_library()

    Returns
    -------
    dict mapping each motion type label to a numpy array of segment indices.
    Buckets with fewer than _MIN_BUCKET_SIZE segments are omitted so callers
    can detect a missing bucket and fall back to the full library.
    """
    acc: dict[str, list[int]] = {}
    for i, m in enumerate(meta):
        mt = m.get("motion_type", MOTION_STRAIGHT)
        acc.setdefault(mt, []).append(i)

    return {
        mt: np.array(indices, dtype=np.intp)
        for mt, indices in acc.items()
        if len(indices) >= _MIN_BUCKET_SIZE
    }


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
    seg_indices: np.ndarray | None = None,
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
    segments    : (N, window_size, 2)
    n_frames    : desired output length
    rng         : numpy Generator
    seg_indices : optional array of indices into segments to draw from.
                  When None, samples uniformly from all N segments.

    Returns
    -------
    noise   : (n_frames, 2)
    seg_idx : int  index of the first segment drawn (for logging)
    """
    pool = seg_indices if seg_indices is not None else np.arange(len(segments))
    window = segments.shape[1]
    seg_idx = int(rng.choice(pool))

    if n_frames <= window:
        return segments[seg_idx, :n_frames].copy(), seg_idx

    chunks: list[np.ndarray] = [segments[seg_idx]]
    offset = segments[seg_idx, -1].copy()
    remaining = n_frames - window

    while remaining > 0:
        take = min(window, remaining)
        new_idx = int(rng.choice(pool))
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
    buckets: dict[str, np.ndarray] | None = None,
    freq: float = 1.0,
) -> tuple[np.ndarray, int]:
    """
    Inject a randomly sampled noise segment onto a single GT path.

    Parameters
    ----------
    gt_xy      : (T, 2) clean ground-truth x, y in target floorplan pixels
    segments   : (N, window_size, 2) noise library in **metres**
    target_dpi : px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
    rng        : numpy Generator for reproducibility; created if None
    buckets    : optional motion-type bucket dict from build_buckets().
                 When provided, the GT path is classified and noise is drawn
                 from the matching bucket. Falls back to the full library if
                 the bucket has fewer than _MIN_BUCKET_SIZE segments.
    freq       : sampling frequency in Hz — used for speed classification

    Returns
    -------
    noisy_xy   : (T, 2)  gt_xy + noise_metres * target_dpi
    seg_idx    : int  index of the first segment used (for logging/reproducibility)
    """
    if rng is None:
        rng = np.random.default_rng()

    seg_indices: np.ndarray | None = None
    if buckets is not None:
        motion_type = classify_path_motion(gt_xy, target_dpi, freq)
        bucket = buckets.get(motion_type)
        if bucket is not None and len(bucket) >= _MIN_BUCKET_SIZE:
            seg_indices = bucket

    T = len(gt_xy)
    noise_m, seg_idx = _build_noise(segments, T, rng, seg_indices)
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
    meta: list[dict] | None = None,
    freq: float = 1.0,
) -> list[dict]:
    """
    Fabricate n_out noisy trajectories from a pool of GT paths.

    GT paths are sampled with replacement, then each path receives aug_mult
    independent noise injections so a single GT path contributes multiple
    output trajectories with different noise realizations.

    Parameters
    ----------
    gt_paths   : list of (T_i, 5) arrays — columns: ts, x, y, gt_x, gt_y
                 (A* output format; x==gt_x at this stage)
    segments   : (N, window_size, 2) noise library in **metres**
    n_out      : total number of fabricated trajectories to produce
    aug_mult   : noise samples per GT path (augmentation multiplier)
    target_dpi : px/m of the target floorplan (use AVALON_DPI=10.0 for Avalon)
    rng        : numpy Generator
    meta       : per-segment metadata list from load_noise_library().
                 When provided, motion-typed injection is enabled: each GT
                 path is classified and noise is drawn from the matching
                 bucket. Falls back to the full library when a bucket is
                 too small (< _MIN_BUCKET_SIZE segments).
    freq       : sampling frequency in Hz — passed to classify_path_motion

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

    buckets = build_buckets(meta) if meta is not None else None

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
            buckets=buckets,
            freq=freq,
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
