"""
Noise-segment dataset for IMU diffusion training.

Loads the 1573-segment noise library built by `build_noise_library.py` and
exposes it as per-step displacement tensors conditioned on motion type.

Why displacements instead of absolute positions?
    Absolute-position segments drift over 150 steps and have a long tail
    (max final drift ~108 m in the existing library). A DDPM trained on
    absolute positions would waste capacity modelling that drift curve.
    Per-step displacements `(dx, dy) = pos[t+1] - pos[t]` are mean-zero,
    bounded, and translationally invariant. We recover absolute trajectories
    at generation time by cumulative-summing from the origin.

Why yaw-rotation augmentation?
    The underlying VIO drift is isotropic — a rotated path has the same
    "straightness" or "turniness". Training with random rotations multiplies
    the effective dataset size and prevents the diffusion model from
    overfitting to the specific heading distribution of the source walks.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset


# Motion-type buckets match preprocess/synthetic_data/build_noise_library.py
# Stable integer encoding so class indices are deterministic across runs.
MOTION_TYPES: Tuple[str, ...] = ("straight", "turn", "stationary")
MOTION_TYPE_TO_IDX = {name: i for i, name in enumerate(MOTION_TYPES)}


@dataclass
class NormalisationStats:
    """Per-channel mean/std computed across the training split displacements."""
    mean: np.ndarray  # shape (2,)
    std: np.ndarray   # shape (2,)

    def to_dict(self) -> dict:
        return {"mean": self.mean.tolist(), "std": self.std.tolist()}

    @classmethod
    def from_dict(cls, d: dict) -> "NormalisationStats":
        return cls(
            mean=np.asarray(d["mean"], dtype=np.float32),
            std=np.asarray(d["std"], dtype=np.float32),
        )


def load_raw_library(
    library_path: Path,
    meta_path: Path,
) -> Tuple[np.ndarray, List[dict]]:
    """
    Load the absolute-position noise library and its per-segment metadata.

    Returns
    -------
    segments : (N, T, 2) float32  absolute positions in metres
    seg_meta : list of dicts, length N, each with at least a 'motion_type' key
    """
    segments = np.load(library_path).astype(np.float32)
    meta = json.loads(Path(meta_path).read_text())
    seg_meta = meta["segments"]
    if len(seg_meta) != segments.shape[0]:
        raise ValueError(
            f"Meta/segment count mismatch: {len(seg_meta)} vs {segments.shape[0]}"
        )
    return segments, seg_meta


def to_displacements(segments: np.ndarray) -> np.ndarray:
    """
    Convert absolute-position segments (N, T, 2) to per-step displacement
    segments (N, T-1, 2). The first absolute position is implicitly the
    origin — at generation time we cumsum from (0, 0).
    """
    return np.diff(segments, axis=1).astype(np.float32)


def from_displacements(displacements: np.ndarray) -> np.ndarray:
    """
    Inverse of to_displacements: cumulative-sum from the origin.
    Input  (N, T-1, 2) → Output (N, T, 2), where the first step is (0, 0).
    """
    n, tm1, d = displacements.shape
    out = np.zeros((n, tm1 + 1, d), dtype=displacements.dtype)
    out[:, 1:, :] = np.cumsum(displacements, axis=1)
    return out


def compute_normalisation(disps: np.ndarray) -> NormalisationStats:
    """Per-channel mean and std across all segments and timesteps."""
    flat = disps.reshape(-1, disps.shape[-1])
    mean = flat.mean(axis=0).astype(np.float32)
    std = flat.std(axis=0).astype(np.float32)
    # Clamp std away from zero for safety — stationary channels can be very flat.
    std = np.maximum(std, 1e-6)
    return NormalisationStats(mean=mean, std=std)


class NoiseSegmentDataset(Dataset):
    """
    Dataset of per-step displacement segments keyed by motion-type class.

    Each item is (disp_tensor, motion_class_idx) where disp_tensor has
    shape (2, T-1) — channels-first to match the 1D U-Net input layout.

    Arguments
    ---------
    library_path     : path to noise_library.npy
    meta_path        : path to noise_library_meta.json
    motion_filter    : optional list of motion_type names to include. If
                       None, all segments are used.
    augment_rotation : if True, each __getitem__ applies a random 2D
                       rotation to the displacement tensor (isotropy prior).
    normalisation    : pre-computed NormalisationStats. If None, stats are
                       computed from the loaded data.
    rng              : numpy Generator for reproducible augmentation.
    """

    def __init__(
        self,
        library_path: Path,
        meta_path: Path,
        motion_filter: Optional[List[str]] = None,
        augment_rotation: bool = True,
        normalisation: Optional[NormalisationStats] = None,
        rng: Optional[np.random.Generator] = None,
    ) -> None:
        super().__init__()
        segments, seg_meta = load_raw_library(library_path, meta_path)

        motion_types = np.asarray(
            [s.get("motion_type", "straight") for s in seg_meta]
        )

        if motion_filter is not None:
            keep = np.isin(motion_types, motion_filter)
            segments = segments[keep]
            motion_types = motion_types[keep]

        disps = to_displacements(segments)  # (N, T-1, 2)

        self.normalisation = normalisation or compute_normalisation(disps)
        # Apply normalisation once at construction; we cache normalised tensors
        # since the dataset is small.
        self._norm_disps = (disps - self.normalisation.mean) / self.normalisation.std

        self._class_idx = np.asarray(
            [MOTION_TYPE_TO_IDX.get(m, 0) for m in motion_types],
            dtype=np.int64,
        )
        self._augment = augment_rotation
        self._rng = rng or np.random.default_rng()

    def __len__(self) -> int:
        return self._norm_disps.shape[0]

    def __getitem__(self, i: int) -> Tuple[torch.Tensor, int]:
        disp = self._norm_disps[i]  # (T-1, 2)
        if self._augment:
            theta = float(self._rng.uniform(0.0, 2.0 * np.pi))
            c, s = np.cos(theta), np.sin(theta)
            rot = np.asarray([[c, -s], [s, c]], dtype=np.float32)
            disp = disp @ rot.T
        # (T-1, 2) → (2, T-1) for conv1d
        tensor = torch.from_numpy(np.ascontiguousarray(disp.T))
        return tensor, int(self._class_idx[i])

    def class_counts(self) -> dict:
        counts = {}
        for name in MOTION_TYPES:
            counts[name] = int((self._class_idx == MOTION_TYPE_TO_IDX[name]).sum())
        return counts
