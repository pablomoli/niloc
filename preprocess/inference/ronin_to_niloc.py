"""
Convert RoNIN inference output to a NILOC-compatible 5-column .txt file.

RoNIN saves predicted trajectories as .npy arrays.  Two shapes are common:
  (T, 2) — predicted x, y positions in metres (inference-only output)
  (T, 4) — [pred_x, pred_y, gt_x, gt_y] in metres (evaluation output)

NILOC .txt format (space-separated, one row per frame):
  ts   vio_x   vio_y   gt_x   gt_y

  ts            seconds (from RoNIN timestamps if available, else row index)
  vio_x, vio_y  predicted position in pixels  =  metres * dpi
  gt_x, gt_y    0.0 at inference time (ground truth unavailable)

At training time gt_x/gt_y contain the true position; at inference they are
left as zeros since NILOC only uses vio_x/vio_y as input — the grid posterior
gives the location estimate.

Usage
-----
  uv run python -m preprocess.inference.ronin_to_niloc \\
      --ronin-npy outputs/ronin/session_001.npy \\
      --out       outputs/niloc_input/session_001.txt \\
      --dpi       10.0

  # With explicit timestamps from RoNIN (optional):
  uv run python -m preprocess.inference.ronin_to_niloc \\
      --ronin-npy outputs/ronin/session_001.npy \\
      --timestamps outputs/ronin/session_001_ts.npy \\
      --out outputs/niloc_input/session_001.txt \\
      --dpi 10.0
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np

_LOG = logging.getLogger(__name__)


def convert(
    ronin_npy: Path,
    out_path: Path,
    dpi: float,
    timestamps: np.ndarray | None = None,
) -> None:
    """
    Convert a RoNIN .npy output file to a NILOC .txt file.

    Parameters
    ----------
    ronin_npy  : RoNIN output array — shape (T, 2) or (T, 4), positions in metres
    out_path   : destination .txt path (parent dirs created if needed)
    dpi        : pixels per metre for the target floorplan
    timestamps : optional (T,) float array in seconds; defaults to row index
    """
    pos = np.load(ronin_npy)
    if pos.ndim == 1:
        pos = pos[np.newaxis, :]

    pred_xy = pos[:, :2]   # (T, 2) metres — use first two columns regardless of shape
    t = len(pred_xy)

    ts: np.ndarray
    if timestamps is not None:
        if len(timestamps) != t:
            raise ValueError(
                f"timestamps length {len(timestamps)} != position length {t}"
            )
        ts = timestamps.astype(np.float64)
    else:
        ts = np.arange(t, dtype=np.float64)

    vio_x = pred_xy[:, 0] * dpi
    vio_y = pred_xy[:, 1] * dpi
    gt_x  = np.zeros(t, dtype=np.float64)
    gt_y  = np.zeros(t, dtype=np.float64)

    out = np.stack([ts, vio_x, vio_y, gt_x, gt_y], axis=-1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savetxt(out_path, out, fmt='%.6f', delimiter=' ')

    _LOG.info(
        "Converted '%s' → '%s'  (%d frames, dpi=%.1f)",
        ronin_npy.name, out_path, t, dpi,
    )


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Convert a RoNIN .npy output to a NILOC 5-column .txt file."
    )
    parser.add_argument('--ronin-npy',   type=Path, required=True,
                        help="RoNIN output .npy file (T,2) or (T,4) in metres.")
    parser.add_argument('--out',         type=Path, required=True,
                        help="Output NILOC .txt path.")
    parser.add_argument('--dpi',         type=float, required=True,
                        help="Pixels per metre for the target floorplan.")
    parser.add_argument('--timestamps',  type=Path, default=None,
                        help="Optional .npy file of (T,) timestamps in seconds.")
    args = parser.parse_args(argv)

    ts = np.load(args.timestamps) if args.timestamps else None
    convert(args.ronin_npy, args.out, dpi=args.dpi, timestamps=ts)


if __name__ == '__main__':
    main()
