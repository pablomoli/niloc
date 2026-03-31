# niloc-fork

## Collaboration
- This repo is shared with Ana (Anastasia Tarasenko) who runs on a Linux machine with an NVIDIA GPU.
- Pablo runs on an M3 MacBook Pro (Apple Silicon, MPS, no CUDA).

## Git
- Commit often and liberally — small, focused commits. Do not batch unrelated changes into one commit.
- Never add Claude as a contributor.

## Environment
- Managed with uv + pyproject.toml (migrated from conda niloc_env.yml).
- pytorch-lightning is pinned to 1.2.6 — do not upgrade, the Trainer API changed significantly in 2.x.
- PyTorch: on Apple Silicon install the standard wheel (MPS). On Linux+NVIDIA use the CUDA wheel from https://download.pytorch.org/whl/cu118 (or match installed CUDA version).
