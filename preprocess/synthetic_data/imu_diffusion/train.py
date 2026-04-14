"""
Train the conditional DDPM on the existing noise library.

Usage (from repo root):

    uv run python -m preprocess.synthetic_data.imu_diffusion.train \
        --library preprocess/data/noise_library.npy \
        --meta preprocess/data/noise_library_meta.json \
        --out-dir preprocess/data/imu_diffusion_ckpts \
        --epochs 200 \
        --batch-size 64

The script writes:

    <out_dir>/model.pt      — final model + normalisation stats + config
    <out_dir>/train_log.txt — per-epoch loss log
    <out_dir>/config.json   — hyperparameters for reproduction

No Hydra wiring — this is a preprocessing step, not part of the main
training pipeline. Use plain argparse so the whole thing can be driven
from a single command.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from preprocess.synthetic_data.imu_diffusion.dataset import (
    NoiseSegmentDataset,
)
from preprocess.synthetic_data.imu_diffusion.diffusion import GaussianDiffusion
from preprocess.synthetic_data.imu_diffusion.model import ConditionalUNet1D


logging.basicConfig(
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
)
_LOG = logging.getLogger("imu_diffusion.train")


@dataclass
class TrainConfig:
    library_path: str
    meta_path: str
    out_dir: str
    epochs: int = 200
    batch_size: int = 64
    lr: float = 1e-4
    weight_decay: float = 1e-4
    num_timesteps: int = 200
    base_channels: int = 64
    channel_mults: tuple = (1, 2, 4)
    time_embed_dim: int = 128
    class_embed_dim: int = 32
    num_classes: int = 3
    augment_rotation: bool = True
    ema_decay: float = 0.999
    seed: int = 42
    log_every: int = 10


class EMAShadow:
    """
    Exponential moving average over model parameters. Keeps a shadow copy
    of the parameters and updates it after each optimizer step. Generation
    runs off the shadow because short DDPM training runs on small data
    are noisy and the EMA dampens the wobble.
    """

    def __init__(self, model: torch.nn.Module, decay: float) -> None:
        self.decay = decay
        self.shadow = {
            k: v.detach().clone() for k, v in model.state_dict().items()
        }

    @torch.no_grad()
    def update(self, model: torch.nn.Module) -> None:
        d = self.decay
        for k, v in model.state_dict().items():
            s = self.shadow[k]
            if v.dtype.is_floating_point:
                s.mul_(d).add_(v.detach(), alpha=1.0 - d)
            else:
                s.copy_(v)

    def state_dict(self) -> dict:
        return self.shadow


def cosine_lr(step: int, total_steps: int, base_lr: float, warmup: int = 500) -> float:
    if step < warmup:
        return base_lr * step / max(1, warmup)
    progress = (step - warmup) / max(1, total_steps - warmup)
    return base_lr * 0.5 * (1.0 + math.cos(math.pi * progress))


def train(cfg: TrainConfig) -> None:
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    out_dir = Path(cfg.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(cfg.seed)
    dataset = NoiseSegmentDataset(
        library_path=Path(cfg.library_path),
        meta_path=Path(cfg.meta_path),
        augment_rotation=cfg.augment_rotation,
        rng=rng,
    )
    _LOG.info(
        "loaded dataset: %d segments, class counts=%s",
        len(dataset),
        dataset.class_counts(),
    )
    sample_x, sample_c = dataset[0]
    _LOG.info(
        "per-item shape: %s  class=%d  seq_length=%d",
        tuple(sample_x.shape),
        sample_c,
        sample_x.shape[-1],
    )

    loader = DataLoader(
        dataset,
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=4,
        pin_memory=True,
        drop_last=True,
        persistent_workers=True,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ConditionalUNet1D(
        in_channels=sample_x.shape[0],
        base_channels=cfg.base_channels,
        channel_mults=cfg.channel_mults,
        time_embed_dim=cfg.time_embed_dim,
        num_classes=cfg.num_classes,
        class_embed_dim=cfg.class_embed_dim,
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    _LOG.info("model params: %.2f M", n_params / 1e6)

    diffusion = GaussianDiffusion(num_timesteps=cfg.num_timesteps).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
    )
    ema = EMAShadow(model, decay=cfg.ema_decay)

    total_steps = cfg.epochs * len(loader)
    _LOG.info(
        "training %d epochs x %d steps/epoch = %d total steps",
        cfg.epochs,
        len(loader),
        total_steps,
    )

    log_path = out_dir / "train_log.txt"
    log_path.write_text("epoch\tmean_loss\tlr\n")

    step = 0
    for epoch in range(cfg.epochs):
        losses = []
        for x, c in loader:
            x = x.to(device, non_blocking=True)
            c = c.to(device, non_blocking=True)

            # LR schedule — cosine with warmup
            lr = cosine_lr(step, total_steps, cfg.lr)
            for pg in optimizer.param_groups:
                pg["lr"] = lr

            loss = diffusion.loss(model, x, c)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            ema.update(model)

            losses.append(float(loss.item()))
            step += 1

        mean_loss = float(np.mean(losses))
        if epoch % cfg.log_every == 0 or epoch == cfg.epochs - 1:
            _LOG.info(
                "epoch %3d/%d  loss=%.4f  lr=%.2e",
                epoch,
                cfg.epochs,
                mean_loss,
                lr,
            )
        with log_path.open("a") as fh:
            fh.write(f"{epoch}\t{mean_loss:.6f}\t{lr:.6e}\n")

    # Save: EMA weights are what we sample from; raw weights kept for debugging.
    ckpt = {
        "model_state": ema.state_dict(),
        "model_state_raw": model.state_dict(),
        "config": asdict(cfg),
        "normalisation": dataset.normalisation.to_dict(),
        "sequence_length": sample_x.shape[-1],
        "num_timesteps": cfg.num_timesteps,
    }
    ckpt_path = out_dir / "model.pt"
    torch.save(ckpt, ckpt_path)
    (out_dir / "config.json").write_text(json.dumps(asdict(cfg), indent=2))
    _LOG.info("saved checkpoint to %s", ckpt_path)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="imu_diffusion.train",
        description="Train a conditional DDPM on the VIO noise library.",
    )
    p.add_argument("--library", type=str, required=True,
                   help="path to preprocess/data/noise_library.npy")
    p.add_argument("--meta", type=str, required=True,
                   help="path to preprocess/data/noise_library_meta.json")
    p.add_argument("--out-dir", type=str, required=True)
    p.add_argument("--epochs", type=int, default=200)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--num-timesteps", type=int, default=200)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-rotation", action="store_true")
    return p


def main() -> None:
    args = _build_parser().parse_args()
    cfg = TrainConfig(
        library_path=args.library,
        meta_path=args.meta,
        out_dir=args.out_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        num_timesteps=args.num_timesteps,
        seed=args.seed,
        augment_rotation=not args.no_rotation,
    )
    train(cfg)


if __name__ == "__main__":
    main()
