"""
Conditional 1D U-Net for VIO-noise-segment diffusion.

Architecture at a glance:
    in (2ch, T=149) → Conv1D → [down1 → down2 → down3] → bottleneck
                                                         ↓
                     out (2ch, T=149) ← Conv1D ← [up3 ← up2 ← up1]

Each down/up block is a ResBlock1D(conv3x, GroupNorm, SiLU) with a
diffusion-timestep FiLM injection and a class-embedding FiLM injection.
Downsampling is stride-2 conv; upsampling is linear interpolation + conv.

The network predicts the noise added during the forward diffusion process
(epsilon parameterisation). Output shape matches input shape so the DDPM
loss is just `mse_loss(pred_noise, true_noise)`.

Rationale for size and depth:
    - 1573 training segments → budget ~1.5–2 M params to avoid overfitting.
    - Length 149 → three stride-2 downsamples give bottleneck length ~19,
      which is enough receptive field to see most of a 150-step window
      in one go without aggressive dilation.
    - Motion-class embedding is a small lookup (3 classes × 32 dims);
      stationary class has only 6 training samples, so we rely on the
      diffusion model's smoothing effect to handle it rather than
      expecting sharp class-specific posteriors.
"""

from __future__ import annotations

import math
from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


def _sinusoidal_timestep_embedding(t: torch.Tensor, dim: int) -> torch.Tensor:
    """
    Transformer-style sinusoidal embedding for the diffusion timestep.
    t : (batch,) long
    returns : (batch, dim) float
    """
    half = dim // 2
    freqs = torch.exp(
        -math.log(10_000.0) * torch.arange(0, half, device=t.device, dtype=torch.float32) / half
    )
    args = t.float()[:, None] * freqs[None, :]
    emb = torch.cat([torch.sin(args), torch.cos(args)], dim=-1)
    if dim % 2 == 1:
        emb = F.pad(emb, (0, 1))
    return emb


class FiLM(nn.Module):
    """
    Feature-wise linear modulation — conditioning scheme that shifts and
    scales per-channel activations based on a concatenated conditioning
    vector (timestep embedding + class embedding).
    """

    def __init__(self, cond_dim: int, num_channels: int) -> None:
        super().__init__()
        self.proj = nn.Linear(cond_dim, num_channels * 2)

    def forward(self, x: torch.Tensor, cond: torch.Tensor) -> torch.Tensor:
        # x: (B, C, T)   cond: (B, cond_dim)
        scale_shift = self.proj(cond)
        scale, shift = scale_shift.chunk(2, dim=-1)
        return x * (1.0 + scale[..., None]) + shift[..., None]


class ResBlock1D(nn.Module):
    """
    Pre-activation residual block with GroupNorm and FiLM conditioning.
    """

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        cond_dim: int,
        groups: int = 8,
    ) -> None:
        super().__init__()
        self.norm1 = nn.GroupNorm(min(groups, in_channels), in_channels)
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size=3, padding=1)
        self.film = FiLM(cond_dim, out_channels)
        self.norm2 = nn.GroupNorm(min(groups, out_channels), out_channels)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size=3, padding=1)
        self.skip = (
            nn.Conv1d(in_channels, out_channels, kernel_size=1)
            if in_channels != out_channels
            else nn.Identity()
        )

    def forward(self, x: torch.Tensor, cond: torch.Tensor) -> torch.Tensor:
        h = self.conv1(F.silu(self.norm1(x)))
        h = self.film(h, cond)
        h = self.conv2(F.silu(self.norm2(h)))
        return h + self.skip(x)


class Downsample1D(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.op = nn.Conv1d(channels, channels, kernel_size=3, stride=2, padding=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.op(x)


def _upsample_to(x: torch.Tensor, target_length: int) -> torch.Tensor:
    """Nearest-neighbour upsample along the temporal axis to match a skip."""
    if x.shape[-1] == target_length:
        return x
    return F.interpolate(x, size=target_length, mode="nearest")


class ConditionalUNet1D(nn.Module):
    """
    Three-level 1D U-Net for short (length ~150) trajectory segments.

    Input  : (B, 2, T) displacement tensor
    Output : (B, 2, T) predicted noise

    Conditioning:
        - Sinusoidal embedding of diffusion timestep t ∈ [0, num_timesteps)
        - Learned embedding of motion class ∈ {0, 1, 2}
        - Both concatenated and passed through a 2-layer MLP that feeds
          every ResBlock's FiLM layer.
    """

    def __init__(
        self,
        in_channels: int = 2,
        base_channels: int = 64,
        channel_mults: Tuple[int, ...] = (1, 2, 4),
        time_embed_dim: int = 128,
        num_classes: int = 3,
        class_embed_dim: int = 32,
    ) -> None:
        super().__init__()

        self.time_embed_dim = time_embed_dim
        cond_dim = time_embed_dim + class_embed_dim

        self.time_mlp = nn.Sequential(
            nn.Linear(time_embed_dim, time_embed_dim),
            nn.SiLU(),
            nn.Linear(time_embed_dim, time_embed_dim),
        )
        self.class_embed = nn.Embedding(num_classes, class_embed_dim)

        # Stem
        self.stem = nn.Conv1d(in_channels, base_channels, kernel_size=3, padding=1)

        # Encoder: base → base*m1 → base*m2 → base*m3 (no downsample after the last)
        channels = [base_channels * m for m in channel_mults]
        self.down_blocks = nn.ModuleList()
        self.downsamples = nn.ModuleList()
        prev_c = base_channels
        for i, c in enumerate(channels):
            self.down_blocks.append(
                nn.ModuleList(
                    [
                        ResBlock1D(prev_c, c, cond_dim=cond_dim),
                        ResBlock1D(c, c, cond_dim=cond_dim),
                    ]
                )
            )
            if i < len(channels) - 1:
                self.downsamples.append(Downsample1D(c))
            else:
                self.downsamples.append(nn.Identity())
            prev_c = c

        # Bottleneck
        self.mid_block_1 = ResBlock1D(prev_c, prev_c, cond_dim=cond_dim)
        self.mid_block_2 = ResBlock1D(prev_c, prev_c, cond_dim=cond_dim)

        # Decoder: mirror of the encoder with skip connections. The first up
        # block (deepest) concatenates the bottleneck output with the deepest
        # skip (already at matching length); subsequent blocks interpolate h
        # up to the next-shallower skip length before concatenation.
        rev = list(reversed(channels))
        self.up_blocks = nn.ModuleList()
        for c in rev:
            # Skip concat doubles channel count at the input of the first ResBlock.
            self.up_blocks.append(
                nn.ModuleList(
                    [
                        ResBlock1D(prev_c + c, c, cond_dim=cond_dim),
                        ResBlock1D(c, c, cond_dim=cond_dim),
                    ]
                )
            )
            prev_c = c

        self.out_norm = nn.GroupNorm(8, prev_c)
        self.out_conv = nn.Conv1d(prev_c, in_channels, kernel_size=3, padding=1)

    def forward(
        self,
        x: torch.Tensor,
        t: torch.Tensor,
        class_idx: torch.Tensor,
    ) -> torch.Tensor:
        """
        x         : (B, 2, T) noisy displacement tensor
        t         : (B,) long   diffusion timestep in [0, num_timesteps)
        class_idx : (B,) long   motion-type class in [0, num_classes)
        returns   : (B, 2, T) predicted noise
        """
        # Build the conditioning vector once per forward.
        t_emb = _sinusoidal_timestep_embedding(t, self.time_embed_dim)
        t_emb = self.time_mlp(t_emb)
        c_emb = self.class_embed(class_idx)
        cond = torch.cat([t_emb, c_emb], dim=-1)

        h = self.stem(x)
        skips = []
        for (block1, block2), downsample in zip(self.down_blocks, self.downsamples):
            h = block1(h, cond)
            h = block2(h, cond)
            skips.append(h)
            h = downsample(h)

        h = self.mid_block_1(h, cond)
        h = self.mid_block_2(h, cond)

        for (block1, block2) in self.up_blocks:
            skip = skips.pop()
            h = _upsample_to(h, skip.shape[-1])
            h = torch.cat([h, skip], dim=1)
            h = block1(h, cond)
            h = block2(h, cond)

        h = F.silu(self.out_norm(h))
        return self.out_conv(h)
