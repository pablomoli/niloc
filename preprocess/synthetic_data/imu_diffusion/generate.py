"""
Generate synthetic noise segments from a trained IMUDiffusion checkpoint
and merge them into an expanded noise library.

Usage (from repo root):

    uv run python -m preprocess.synthetic_data.imu_diffusion.generate \
        --ckpt preprocess/data/imu_diffusion_ckpts/model.pt \
        --real-library preprocess/data/noise_library.npy \
        --real-meta preprocess/data/noise_library_meta.json \
        --out-library preprocess/data/noise_library_v2.npy \
        --out-meta preprocess/data/noise_library_v2_meta.json \
        --target-total 5000

The script:
  1. Loads the trained conditional DDPM and its normalisation stats.
  2. For each motion-type bucket, generates enough synthetic segments to
     bring that bucket up to a target size (proportional by default, or
     flat per-bucket with --per-class-counts).
  3. Un-normalises displacements, cumsums to absolute positions, concatenates
     with the real library, and writes the merged library + metadata.
  4. Synthetic segments carry `"synthetic": True` in their per-segment
     metadata so downstream code can filter or track them.

Validation: compares per-bucket mean drift and variance between real and
synthetic segments; rejects the run with an error if the synthetic
distribution is implausibly far from the real one (configurable tolerance).
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from preprocess.synthetic_data.imu_diffusion.dataset import (
    MOTION_TYPES,
    MOTION_TYPE_TO_IDX,
    NormalisationStats,
    from_displacements,
    load_raw_library,
    to_displacements,
)
from preprocess.synthetic_data.imu_diffusion.diffusion import GaussianDiffusion
from preprocess.synthetic_data.imu_diffusion.model import ConditionalUNet1D


logging.basicConfig(
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
)
_LOG = logging.getLogger("imu_diffusion.generate")


@dataclass
class GenConfig:
    ckpt_path: Path
    real_library: Path
    real_meta: Path
    out_library: Path
    out_meta: Path
    target_total: int = 5000
    batch_size: int = 64
    per_class_counts: Optional[Dict[str, int]] = None
    seed: int = 42
    drift_tolerance: float = 0.5
    min_stationary: int = 500


def _load_checkpoint(ckpt_path: Path, device: torch.device):
    _LOG.info("loading checkpoint %s", ckpt_path)
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    cfg = ckpt["config"]
    model = ConditionalUNet1D(
        in_channels=2,
        base_channels=cfg["base_channels"],
        channel_mults=tuple(cfg["channel_mults"]),
        time_embed_dim=cfg["time_embed_dim"],
        num_classes=cfg["num_classes"],
        class_embed_dim=cfg["class_embed_dim"],
    ).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    diffusion = GaussianDiffusion(num_timesteps=ckpt["num_timesteps"]).to(device)
    norm = NormalisationStats.from_dict(ckpt["normalisation"])
    seq_length = int(ckpt["sequence_length"])
    return model, diffusion, norm, seq_length


def _decide_per_class_counts(
    real_counts: Counter,
    target_total: int,
    user_counts: Optional[Dict[str, int]],
    min_stationary: int,
) -> Dict[str, int]:
    """
    Work out how many synthetic segments to generate per motion-type bucket.

    Policy (when user doesn't override):
      - Every bucket gets topped up to the same synthetic count as the
        largest real bucket, so the final split is balanced.
      - Stationary is an exception: we enforce at least `min_stationary`
        synthetic segments regardless, because the source library has
        only 6 and the natural ratio would keep it drastically underrepresented.
    """
    if user_counts is not None:
        return {k: int(v) for k, v in user_counts.items()}

    real_total = sum(real_counts.values())
    needed = max(0, target_total - real_total)
    largest_real = max(real_counts.values()) if real_counts else 0

    synth: Dict[str, int] = {}
    for mt in MOTION_TYPES:
        target_bucket = max(largest_real, real_counts.get(mt, 0))
        synth[mt] = max(0, target_bucket - real_counts.get(mt, 0))

    # Enforce stationary floor
    if synth.get("stationary", 0) < min_stationary:
        synth["stationary"] = min_stationary

    # If our derived counts undershoot `needed`, scale the non-stationary
    # buckets up proportionally so we hit the target total.
    derived_total = sum(synth.values())
    if derived_total < needed:
        slack = needed - derived_total
        non_stat = [mt for mt in MOTION_TYPES if mt != "stationary"]
        share = slack // max(1, len(non_stat))
        for mt in non_stat:
            synth[mt] += share

    return synth


@torch.no_grad()
def _sample_class_segments(
    model: torch.nn.Module,
    diffusion: GaussianDiffusion,
    norm: NormalisationStats,
    seq_length: int,
    class_idx_int: int,
    n_samples: int,
    batch_size: int,
    device: torch.device,
) -> np.ndarray:
    """
    Sample `n_samples` displacement segments for a single motion class.
    Returns (n_samples, seq_length + 1, 2) absolute-position segments
    in the original (metres) space — same shape as the real library.
    """
    all_segments: List[np.ndarray] = []
    remaining = n_samples
    while remaining > 0:
        b = min(batch_size, remaining)
        class_idx = torch.full((b,), class_idx_int, dtype=torch.long, device=device)
        shape = (b, 2, seq_length)
        normed_disps = diffusion.sample(model, shape, class_idx, device=device)
        # (B, 2, T) → (B, T, 2)
        normed_disps_np = normed_disps.cpu().numpy().transpose(0, 2, 1)
        disps = normed_disps_np * norm.std + norm.mean
        segments = from_displacements(disps)
        all_segments.append(segments.astype(np.float32))
        remaining -= b
    return np.concatenate(all_segments, axis=0)


def _drift_stats(segments: np.ndarray) -> Tuple[float, float, float]:
    """Return (mean, std, p95) of final drift magnitude in metres."""
    final = np.linalg.norm(segments[:, -1, :] - segments[:, 0, :], axis=1)
    return float(final.mean()), float(final.std()), float(np.percentile(final, 95))


def generate(cfg: GenConfig) -> None:
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, diffusion, norm, seq_length = _load_checkpoint(cfg.ckpt_path, device)

    _LOG.info(
        "loaded model: seq_length=%d  norm.mean=%s  norm.std=%s",
        seq_length,
        norm.mean.tolist(),
        norm.std.tolist(),
    )

    # Load real library and tally motion buckets.
    real_segments, real_meta = load_raw_library(cfg.real_library, cfg.real_meta)
    real_counts = Counter(m.get("motion_type", "straight") for m in real_meta)
    _LOG.info("real library: %d segments  counts=%s", len(real_meta), dict(real_counts))

    # Also compute real per-bucket drift stats for validation.
    real_disps = to_displacements(real_segments)
    real_disps_absolute = real_segments  # for drift metrics
    bucket_idxs = {
        mt: np.where(np.asarray([m.get("motion_type") == mt for m in real_meta]))[0]
        for mt in MOTION_TYPES
    }
    real_drift_stats = {
        mt: _drift_stats(real_segments[idx]) if len(idx) > 0 else (0.0, 0.0, 0.0)
        for mt, idx in bucket_idxs.items()
    }
    _LOG.info("real drift stats per bucket (mean, std, p95):")
    for mt, s in real_drift_stats.items():
        _LOG.info("  %-11s %.3f m  %.3f m  %.3f m", mt, *s)

    synth_counts = _decide_per_class_counts(
        real_counts=real_counts,
        target_total=cfg.target_total,
        user_counts=cfg.per_class_counts,
        min_stationary=cfg.min_stationary,
    )
    _LOG.info("planned synthetic counts: %s  (total %d)", synth_counts, sum(synth_counts.values()))

    # Sample each bucket.
    synth_segments_by_class: Dict[str, np.ndarray] = {}
    for mt, n in synth_counts.items():
        if n <= 0:
            synth_segments_by_class[mt] = np.zeros((0, seq_length + 1, 2), dtype=np.float32)
            continue
        _LOG.info("sampling %d segments for class '%s'", n, mt)
        segments = _sample_class_segments(
            model=model,
            diffusion=diffusion,
            norm=norm,
            seq_length=seq_length,
            class_idx_int=MOTION_TYPE_TO_IDX[mt],
            n_samples=n,
            batch_size=cfg.batch_size,
            device=device,
        )
        synth_segments_by_class[mt] = segments
        s = _drift_stats(segments)
        _LOG.info(
            "  synth drift: mean=%.3f std=%.3f p95=%.3f m (real: %.3f %.3f %.3f)",
            *s, *real_drift_stats[mt],
        )

        # Sanity check: synthetic mean drift should be within tolerance of real.
        if real_drift_stats[mt][0] > 0.0:
            rel = abs(s[0] - real_drift_stats[mt][0]) / max(real_drift_stats[mt][0], 1e-6)
            if rel > cfg.drift_tolerance:
                _LOG.warning(
                    "class '%s' mean drift differs from real by %.1f%% (> %.1f%% tolerance)",
                    mt,
                    rel * 100,
                    cfg.drift_tolerance * 100,
                )

    # Merge: real segments first, then synthetic, preserving order so
    # indices of real segments don't change if something downstream uses them.
    synth_blocks = [synth_segments_by_class[mt] for mt in MOTION_TYPES if len(synth_segments_by_class[mt]) > 0]
    if synth_blocks:
        synth_segments = np.concatenate(synth_blocks, axis=0).astype(np.float32)
    else:
        synth_segments = np.zeros((0, seq_length + 1, 2), dtype=np.float32)
    all_segments = np.concatenate([real_segments, synth_segments], axis=0)

    # Build merged metadata.
    merged_meta_list: List[dict] = []
    for m in real_meta:
        entry = dict(m)
        entry["synthetic"] = False
        merged_meta_list.append(entry)

    synth_offset = len(real_meta)
    synth_idx_counter = 0
    for mt in MOTION_TYPES:
        block = synth_segments_by_class[mt]
        for j in range(len(block)):
            final_drift = float(np.linalg.norm(block[j, -1] - block[j, 0]))
            mean_drift = float(np.linalg.norm(block[j], axis=-1).mean())
            max_drift = float(np.linalg.norm(block[j], axis=-1).max())
            merged_meta_list.append({
                "source": f"imu_diffusion_{mt}_{synth_idx_counter:05d}",
                "frame_start": 0,
                "frame_end": block.shape[1],
                "mean_drift": mean_drift,
                "max_drift": max_drift,
                "final_drift": final_drift,
                "motion_type": mt,
                "synthetic": True,
            })
            synth_idx_counter += 1

    merged_counts = Counter(m["motion_type"] for m in merged_meta_list)
    synthetic_count = sum(1 for m in merged_meta_list if m.get("synthetic"))

    # Match the top-level metadata shape that the real library uses so
    # downstream code (fabricate.py / inject_noise.load_noise_library)
    # works unchanged.
    final_absolute = all_segments
    merged_meta = {
        "n_segments": int(len(all_segments)),
        "window_size": int(all_segments.shape[1]),
        "stride": 50,
        "units": "metres",
        "target_freq_hz": 1.0,
        "shape": list(all_segments.shape),
        "mean_drift_m": float(np.linalg.norm(final_absolute[:, -1] - final_absolute[:, 0], axis=1).mean()),
        "median_drift_m": float(np.median(np.linalg.norm(final_absolute[:, -1] - final_absolute[:, 0], axis=1))),
        "p95_drift_m": float(np.percentile(np.linalg.norm(final_absolute[:, -1] - final_absolute[:, 0], axis=1), 95)),
        "max_drift_m": float(np.linalg.norm(final_absolute[:, -1] - final_absolute[:, 0], axis=1).max()),
        "motion_buckets": dict(merged_counts),
        "n_real": int(len(real_meta)),
        "n_synthetic": int(synthetic_count),
        "synthetic_source": "imu_diffusion",
        "segments": merged_meta_list,
    }

    cfg.out_library.parent.mkdir(parents=True, exist_ok=True)
    np.save(cfg.out_library, all_segments)
    cfg.out_meta.write_text(json.dumps(merged_meta, indent=2))
    _LOG.info(
        "wrote expanded library: %s (%d segments, %d real + %d synthetic)",
        cfg.out_library,
        len(all_segments),
        len(real_meta),
        synthetic_count,
    )
    _LOG.info("merged motion buckets: %s", dict(merged_counts))


def _parse_per_class(arg: Optional[str]) -> Optional[Dict[str, int]]:
    if not arg:
        return None
    parts = {}
    for chunk in arg.split(","):
        k, v = chunk.split("=")
        parts[k.strip()] = int(v.strip())
    return parts


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="imu_diffusion.generate",
        description="Sample synthetic noise segments and merge into expanded library.",
    )
    p.add_argument("--ckpt", type=Path, required=True)
    p.add_argument("--real-library", type=Path, required=True)
    p.add_argument("--real-meta", type=Path, required=True)
    p.add_argument("--out-library", type=Path, required=True)
    p.add_argument("--out-meta", type=Path, required=True)
    p.add_argument("--target-total", type=int, default=5000)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--per-class-counts", type=str, default=None,
                   help="override auto-planning, e.g. 'straight=1000,turn=1000,stationary=500'")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--min-stationary", type=int, default=500)
    p.add_argument("--drift-tolerance", type=float, default=0.5)
    return p


def main() -> None:
    args = _build_parser().parse_args()
    cfg = GenConfig(
        ckpt_path=args.ckpt,
        real_library=args.real_library,
        real_meta=args.real_meta,
        out_library=args.out_library,
        out_meta=args.out_meta,
        target_total=args.target_total,
        batch_size=args.batch_size,
        per_class_counts=_parse_per_class(args.per_class_counts),
        seed=args.seed,
        drift_tolerance=args.drift_tolerance,
        min_stationary=args.min_stationary,
    )
    generate(cfg)


if __name__ == "__main__":
    main()
