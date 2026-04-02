"""
Junction smoothing for A* ground-truth paths (issue #8).

A* paths have sharp direction changes at waypoints. This module detects those
junctions by looking for large turning angles and applies a localized B-spline
smoothing window around each one. The rest of the path is left intact.

Smoothing runs on GT only — noise injection (issue #6) happens after.

Public API
----------
  detect_junctions(path, angle_threshold_deg, min_gap) -> list[int]
  smooth_path(path, junction_frames, half_window, smooth_s) -> np.ndarray
  smooth_junctions(path, angle_threshold_deg, half_window, min_gap, smooth_s) -> np.ndarray
  make_timestamps(n_frames, freq) -> np.ndarray
"""

from __future__ import annotations

import numpy as np
from scipy.interpolate import (
    splev,
    splprep,
)

# ---------------------------------------------------------------------------
# Junction detection
# ---------------------------------------------------------------------------


def detect_junctions(
    path: np.ndarray,
    angle_threshold_deg: float = 15.0,
    min_gap: int = 10,
) -> list[int]:
    """
    Return frame indices where the path makes a sharp turn.

    A junction is a frame where the angle between the incoming and outgoing
    velocity vectors exceeds angle_threshold_deg. Junctions closer than
    min_gap frames apart are merged to the earlier one to avoid overlapping
    smoothing windows.

    Parameters
    ----------
    path              : (T, 2) x, y coordinates
    angle_threshold_deg: minimum turn angle to flag as a junction
    min_gap           : minimum frames between reported junctions

    Returns
    -------
    list of frame indices (0-indexed, interior frames only)
    """
    if len(path) < 3:
        return []

    v = np.diff(path, axis=0)          # (T-1, 2) velocity vectors
    norms = np.linalg.norm(v, axis=1)

    # Avoid division by zero on stationary frames
    valid = norms > 1e-8
    angles = np.zeros(len(v) - 1)
    for i in range(len(v) - 1):
        if valid[i] and valid[i + 1]:
            cos_a = np.clip(
                np.dot(v[i], v[i + 1]) / (norms[i] * norms[i + 1]), -1.0, 1.0
            )
            angles[i] = np.degrees(np.arccos(cos_a))

    threshold = angle_threshold_deg
    raw = [int(i + 1) for i, a in enumerate(angles) if a >= threshold]

    # Merge junctions that are closer than min_gap
    merged: list[int] = []
    for idx in raw:
        if not merged or idx - merged[-1] >= min_gap:
            merged.append(idx)

    return merged


# ---------------------------------------------------------------------------
# Local B-spline smoothing
# ---------------------------------------------------------------------------


def smooth_path(
    path: np.ndarray,
    junction_frames: list[int],
    half_window: int = 20,
    smooth_s: float = 1.0,
) -> np.ndarray:
    """
    Apply localized B-spline smoothing around each junction frame.

    For each junction, a window of [junction - half_window, junction + half_window]
    frames is extracted, a B-spline is fit to it, and the smoothed points replace
    the originals. The endpoints of each window are held fixed so the path remains
    continuous with the unsmoothed portions.

    Parameters
    ----------
    path           : (T, 2) x, y coordinates
    junction_frames: list of junction frame indices from detect_junctions()
    half_window    : frames on each side of the junction to include in smoothing
    smooth_s       : B-spline smoothing factor (higher = smoother, less faithful)

    Returns
    -------
    smoothed : (T, 2) path with junctions smoothed in-place
    """
    smoothed = path.copy()
    T = len(path)

    for jf in junction_frames:
        lo = max(0, jf - half_window)
        hi = min(T - 1, jf + half_window)
        window = smoothed[lo : hi + 1]

        if len(window) < 4:
            continue

        # Remove duplicate points that would cause splprep to fail
        dists = np.linalg.norm(np.diff(window, axis=0), axis=1)
        keep = np.concatenate([[True], dists > 1e-8])
        window_clean = window[keep]

        if len(window_clean) < 4:
            continue

        try:
            tck, _u = splprep(window_clean.T, s=len(window_clean) / smooth_s, k=3)
            u_dense = np.linspace(0, 1, len(window))
            new_pts = np.stack(splev(u_dense, tck), axis=-1)
        except Exception:
            continue

        # Pin endpoints to preserve continuity with adjacent unsmoothed regions
        new_pts[0]  = smoothed[lo]
        new_pts[-1] = smoothed[hi]
        smoothed[lo : hi + 1] = new_pts

    return smoothed


# ---------------------------------------------------------------------------
# Combined entry point
# ---------------------------------------------------------------------------


def smooth_junctions(
    path: np.ndarray,
    angle_threshold_deg: float = 15.0,
    half_window: int = 20,
    min_gap: int = 10,
    smooth_s: float = 1.0,
) -> tuple[np.ndarray, list[int]]:
    """
    Detect and smooth all junctions in a single call.

    Parameters
    ----------
    path               : (T, 2) x, y ground-truth coordinates
    angle_threshold_deg: minimum turn angle flagged as a junction (degrees)
    half_window        : frames smoothed on each side of the junction
    min_gap            : minimum frames between junctions
    smooth_s           : B-spline smoothing factor

    Returns
    -------
    smoothed        : (T, 2) path with junctions smoothed
    junction_frames : list of detected junction indices (for logging / plotting)
    """
    junctions = detect_junctions(path, angle_threshold_deg, min_gap)
    smoothed = smooth_path(path, junctions, half_window, smooth_s)
    return smoothed, junctions


# ---------------------------------------------------------------------------
# Timestamp generation
# ---------------------------------------------------------------------------


def make_timestamps(n_frames: int, freq: float = 1.0) -> np.ndarray:
    """
    Generate a contiguous timestamp array starting at 0.

    Parameters
    ----------
    n_frames : number of frames
    freq     : sampling frequency in Hz

    Returns
    -------
    (n_frames,) array of seconds, starting at 0, step = 1/freq
    """
    return np.arange(n_frames, dtype=np.float64) / freq
