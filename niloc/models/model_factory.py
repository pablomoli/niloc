from typing import Union, Dict, Any

import torch
from omegaconf import DictConfig

from niloc.models.seq2seq_factory import build_seq2seq
from niloc.models.transformer_factory import build_transformer


def get_model(
        arch: str, cfg: Union[DictConfig, Dict[str, Any]], input_dim: int = 6, output_dim: int = 3
) -> torch.nn.Module:
    """
    Create a model, given model name and configurations
    Args:
        - arch - model name
        - cfg - configuration
        - input_dim, output_dim - input, output feature dimensions
    """

    if "transformer" in cfg.arch.name:
        return build_transformer(arch, cfg, input_dim, output_dim)
    else:
        return build_seq2seq(arch, cfg, input_dim, output_dim)
