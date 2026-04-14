"""
DDPM forward/reverse process for the noise-segment diffusion model.

Epsilon parameterisation: the model predicts the noise added at each
timestep rather than the denoised signal directly. Standard DDPM training
target and sampling loop (Ho et al., 2020).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn.functional as F


def linear_beta_schedule(
    num_timesteps: int,
    beta_start: float = 1e-4,
    beta_end: float = 0.02,
) -> torch.Tensor:
    """Standard DDPM linear schedule. Returns a (num_timesteps,) tensor."""
    return torch.linspace(beta_start, beta_end, num_timesteps, dtype=torch.float32)


@dataclass
class DiffusionConstants:
    """
    Precomputed constants for the forward and reverse processes.

    All tensors are 1D of length `num_timesteps` and live on the requested
    device. They are registered as buffers by `GaussianDiffusion` so they
    move with the module.
    """
    betas: torch.Tensor
    alphas: torch.Tensor
    alphas_cumprod: torch.Tensor
    alphas_cumprod_prev: torch.Tensor
    sqrt_alphas_cumprod: torch.Tensor
    sqrt_one_minus_alphas_cumprod: torch.Tensor
    sqrt_recip_alphas: torch.Tensor
    posterior_variance: torch.Tensor


def build_diffusion_constants(num_timesteps: int) -> DiffusionConstants:
    betas = linear_beta_schedule(num_timesteps)
    alphas = 1.0 - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    alphas_cumprod_prev = F.pad(alphas_cumprod[:-1], (1, 0), value=1.0)
    sqrt_alphas_cumprod = torch.sqrt(alphas_cumprod)
    sqrt_one_minus_alphas_cumprod = torch.sqrt(1.0 - alphas_cumprod)
    sqrt_recip_alphas = torch.sqrt(1.0 / alphas)
    posterior_variance = betas * (1.0 - alphas_cumprod_prev) / (1.0 - alphas_cumprod)
    return DiffusionConstants(
        betas=betas,
        alphas=alphas,
        alphas_cumprod=alphas_cumprod,
        alphas_cumprod_prev=alphas_cumprod_prev,
        sqrt_alphas_cumprod=sqrt_alphas_cumprod,
        sqrt_one_minus_alphas_cumprod=sqrt_one_minus_alphas_cumprod,
        sqrt_recip_alphas=sqrt_recip_alphas,
        posterior_variance=posterior_variance,
    )


class GaussianDiffusion(torch.nn.Module):
    """
    Thin wrapper that holds the beta schedule buffers and exposes the two
    operations we need: (1) add noise to a clean sample at a given timestep
    for training, (2) run the reverse process to sample from noise.

    Usage:
        diffusion = GaussianDiffusion(num_timesteps=200)
        loss = diffusion.loss(model, x0, class_idx)
        samples = diffusion.sample(model, shape=(N, 2, T), class_idx)
    """

    def __init__(self, num_timesteps: int = 200) -> None:
        super().__init__()
        self.num_timesteps = num_timesteps
        constants = build_diffusion_constants(num_timesteps)
        for name, tensor in constants.__dict__.items():
            self.register_buffer(name, tensor, persistent=False)

    def _extract(self, a: torch.Tensor, t: torch.Tensor, x_shape) -> torch.Tensor:
        """Gather per-sample schedule values and reshape for broadcast."""
        out = a.gather(0, t)
        return out.reshape(-1, *([1] * (len(x_shape) - 1)))

    def q_sample(
        self,
        x_start: torch.Tensor,
        t: torch.Tensor,
        noise: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Forward diffusion: add noise to x_start at timestep t.
        x_start : (B, C, T)
        t       : (B,) long
        """
        if noise is None:
            noise = torch.randn_like(x_start)
        sqrt_ac = self._extract(self.sqrt_alphas_cumprod, t, x_start.shape)
        sqrt_omac = self._extract(self.sqrt_one_minus_alphas_cumprod, t, x_start.shape)
        return sqrt_ac * x_start + sqrt_omac * noise

    def loss(
        self,
        model: torch.nn.Module,
        x_start: torch.Tensor,
        class_idx: torch.Tensor,
    ) -> torch.Tensor:
        """
        Standard DDPM epsilon-parameterisation training loss. Samples a
        random diffusion timestep per batch element, corrupts the input,
        and asks the model to predict the noise.
        """
        b = x_start.shape[0]
        t = torch.randint(0, self.num_timesteps, (b,), device=x_start.device)
        noise = torch.randn_like(x_start)
        x_t = self.q_sample(x_start, t, noise)
        pred_noise = model(x_t, t, class_idx)
        return F.mse_loss(pred_noise, noise)

    @torch.no_grad()
    def p_sample(
        self,
        model: torch.nn.Module,
        x: torch.Tensor,
        t_idx: int,
        class_idx: torch.Tensor,
    ) -> torch.Tensor:
        """Single reverse step: x_t → x_{t-1}."""
        t = torch.full(
            (x.shape[0],), t_idx, device=x.device, dtype=torch.long
        )
        pred_noise = model(x, t, class_idx)

        sqrt_recip_alpha = self._extract(self.sqrt_recip_alphas, t, x.shape)
        beta = self._extract(self.betas, t, x.shape)
        sqrt_omac = self._extract(self.sqrt_one_minus_alphas_cumprod, t, x.shape)
        model_mean = sqrt_recip_alpha * (x - beta * pred_noise / sqrt_omac)

        if t_idx == 0:
            return model_mean
        post_var = self._extract(self.posterior_variance, t, x.shape)
        noise = torch.randn_like(x)
        return model_mean + torch.sqrt(post_var) * noise

    @torch.no_grad()
    def sample(
        self,
        model: torch.nn.Module,
        shape,
        class_idx: torch.Tensor,
        device: Optional[torch.device] = None,
    ) -> torch.Tensor:
        """
        Full reverse diffusion: pure Gaussian noise → sample.
        shape      : (batch, channels, length)
        class_idx  : (batch,) long
        """
        if device is None:
            device = self.betas.device
        x = torch.randn(shape, device=device)
        for t in reversed(range(self.num_timesteps)):
            x = self.p_sample(model, x, t, class_idx)
        return x
