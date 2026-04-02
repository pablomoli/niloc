"""
Run RoNIN inference on a HyperIMU HDF5 file and produce a position trajectory.

This script bypasses RoNIN's dataset class (which requires info.json calibration
and pose/tango_pos Visual SLAM ground truth) and performs inference directly from
the HDF5 produced by himu_to_ronin.py.

Feature computation (identical to GlobSpeedSequence):
  - Rotate gyro and acce from device frame to global frame using orientation quaternion
  - Concatenate: [glob_gyro (3), glob_acce (3)] = 6-dim feature per timestep

No calibration is applied (no IMU bias/scale correction) since those values are
device-specific and not available for a bare HIMU recording. This reduces accuracy
compared to a fully calibrated RoNIN run but is the practical choice.

Supported models
----------------
  resnet  — ResNet18 1D (window=200, step=10)  checkpoint_gsn_latest.pt
  lstm    — Bilinear LSTM seq-to-seq (window=400, step=100)
  tcn     — TCN seq-to-seq (window=400, step=100)

Output
------
  <out>.npy  — (T, 2) float64 array of (x, y) positions in metres, starting at (0, 0)

Usage
-----
  uv run python -m preprocess.inference.ronin_infer \\
      --hdf5  outputs/ronin_input/session.hdf5 \\
      --model resnet \\
      --checkpoint /path/to/ronin/ronin_resnet/checkpoint_gsn_latest.pt \\
      --ronin-source /path/to/ronin/source \\
      --out   outputs/ronin_out/session_resnet.npy

  # Run all three models and compare:
  for MODEL in resnet lstm tcn; do
    uv run python -m preprocess.inference.ronin_infer \\
        --hdf5 outputs/ronin_input/session.hdf5 \\
        --model $MODEL \\
        --checkpoint /path/to/ronin/ronin_$MODEL/checkpoints/*.pt \\
        --ronin-source /path/to/ronin/source \\
        --out outputs/ronin_out/session_$MODEL.npy
  done
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import h5py
import numpy as np
import quaternion as Q
import torch
from scipy.interpolate import interp1d

_LOG = logging.getLogger(__name__)

# ResNet defaults (from ronin_resnet.py argparser)
_RESNET_WINDOW  = 200
_RESNET_STEP    = 10
_RESNET_FC_CFG  = {'fc_dim': 512, 'in_dim': 7, 'dropout': 0.5, 'trans_planes': 128}

# LSTM / TCN defaults (from config.json files)
_LSTM_WINDOW    = 400
_LSTM_STEP      = 100
_TCN_WINDOW     = 400
_TCN_STEP       = 100
_TCN_CHANNELS   = [32, 64, 128, 256, 72, 36]


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def compute_features(hdf5_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """
    Load an HDF5 file (from himu_to_ronin.py) and return global-frame features.

    Parameters
    ----------
    hdf5_path : path to HDF5 file with synced/time, synced/acce, synced/gyro,
                synced/game_rv (quaternion [w,x,y,z])

    Returns
    -------
    features : (T, 6) float64 — [glob_gyro(3), glob_acce(3)]
    time     : (T,)   float64 — timestamps in seconds
    """
    with h5py.File(hdf5_path, 'r') as f:
        time    = np.array(f['synced/time'],    dtype=np.float64)
        acce    = np.array(f['synced/acce'],    dtype=np.float64)
        gyro    = np.array(f['synced/gyro'],    dtype=np.float64)
        game_rv = np.array(f['synced/game_rv'], dtype=np.float64)  # [w, x, y, z]

    n = len(time)
    # Build quaternion array — numpy-quaternion from_float_array expects [w,x,y,z]
    ori_q = Q.from_float_array(game_rv)

    # Rotate gyro and acce from device frame to global frame: q * v_q * q*
    gyro_q = Q.from_float_array(np.concatenate([np.zeros((n, 1)), gyro], axis=1))
    acce_q = Q.from_float_array(np.concatenate([np.zeros((n, 1)), acce], axis=1))
    glob_gyro = Q.as_float_array(ori_q * gyro_q * ori_q.conj())[:, 1:]  # (T, 3)
    glob_acce = Q.as_float_array(ori_q * acce_q * ori_q.conj())[:, 1:]  # (T, 3)

    features = np.concatenate([glob_gyro, glob_acce], axis=1).astype(np.float64)
    _LOG.info("Features computed: shape=%s, time range=[%.3f, %.3f]s",
              features.shape, time[0], time[-1])
    return features, time


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _add_ronin_source(ronin_source: Path) -> None:
    """Add the RoNIN source directory to sys.path."""
    src = str(ronin_source)
    if src not in sys.path:
        sys.path.insert(0, src)


def load_resnet(
    checkpoint_path: Path, ronin_source: Path, window_size: int = _RESNET_WINDOW
) -> torch.nn.Module:
    """Load the RoNIN ResNet18 model from a checkpoint."""
    _add_ronin_source(ronin_source)
    from model_resnet1d import (  # type: ignore[import]  # noqa: PLC0415
        BasicBlock1D,
        FCOutputModule,
        ResNet1D,
    )

    fc_cfg = dict(_RESNET_FC_CFG)
    fc_cfg['in_dim'] = window_size // 32 + 1

    network = ResNet1D(6, 2, BasicBlock1D, [2, 2, 2, 2],
                       base_plane=64, output_block=FCOutputModule, kernel_size=3, **fc_cfg)
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
    network.load_state_dict(ckpt['model_state_dict'])
    network.eval()
    _LOG.info("ResNet loaded from %s", checkpoint_path)
    return network


def load_lstm(checkpoint_path: Path, ronin_source: Path) -> torch.nn.Module:
    """Load the RoNIN Bilinear LSTM model from a checkpoint."""
    _add_ronin_source(ronin_source)
    from model_temporal import BilinearLSTMSeqNetwork  # type: ignore[import]  # noqa: PLC0415

    device = torch.device('cpu')
    network = BilinearLSTMSeqNetwork(
        input_size=6, out_size=2, batch_size=1, device=device,
        lstm_size=100, lstm_layers=3, dropout=0.2,
    )
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
    network.load_state_dict(ckpt['model_state_dict'])
    network.eval()
    _LOG.info("LSTM loaded from %s", checkpoint_path)
    return network


def load_tcn(checkpoint_path: Path, ronin_source: Path) -> torch.nn.Module:
    """Load the RoNIN TCN model from a checkpoint."""
    _add_ronin_source(ronin_source)
    from model_temporal import TCNSeqNetwork  # type: ignore[import]  # noqa: PLC0415

    network = TCNSeqNetwork(
        input_channel=6, output_channel=2,
        kernel_size=3, layer_channels=_TCN_CHANNELS, dropout=0.2,
    )
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
    network.load_state_dict(ckpt['model_state_dict'])
    network.eval()
    _LOG.info("TCN loaded from %s", checkpoint_path)
    return network


# ---------------------------------------------------------------------------
# Sliding-window inference
# ---------------------------------------------------------------------------

def _run_resnet(network: torch.nn.Module, features: np.ndarray,
                window_size: int, step_size: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Run ResNet in sliding window mode.

    Returns
    -------
    pred_vel   : (N, 2) predicted global velocities in m/s
    step_frames: (N,) frame indices where each prediction applies
    """
    T = len(features)
    preds, frames = [], []
    with torch.no_grad():
        for start in range(0, T - window_size, step_size):
            window = features[start:start + window_size]  # (window_size, 6)
            feat = torch.from_numpy(window.T).float().unsqueeze(0)  # (1, 6, window_size)
            vel = network(feat).squeeze(0).numpy()  # (2,)
            preds.append(vel)
            frames.append(start + window_size)  # velocity at end of window
    return np.array(preds, dtype=np.float64), np.array(frames)


def _run_seq2seq(network: torch.nn.Module, features: np.ndarray,
                 window_size: int, step_size: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Run LSTM or TCN in sliding window mode.

    These models output a velocity per frame in the window; we take the
    velocity at the last frame of each window.

    Returns
    -------
    pred_vel   : (N, 2)
    step_frames: (N,)
    """
    T = len(features)
    preds, frames = [], []
    with torch.no_grad():
        for start in range(0, T - window_size, step_size):
            window = features[start:start + window_size]  # (window_size, 6)
            feat = torch.from_numpy(window).float().unsqueeze(0)  # (1, window_size, 6)
            out = network(feat).squeeze(0).numpy()  # (window_size, 2)
            vel = out[-1]  # velocity at last frame of window
            preds.append(vel)
            frames.append(start + window_size - 1)
    return np.array(preds, dtype=np.float64), np.array(frames)


# ---------------------------------------------------------------------------
# Velocity → position integration
# ---------------------------------------------------------------------------

def integrate_velocities(pred_vel: np.ndarray, step_frames: np.ndarray,
                         time: np.ndarray) -> np.ndarray:
    """
    Integrate predicted velocities to a position trajectory.

    Each prediction covers step_size frames. The mean time between consecutive
    step frames is used as dt. Position is reconstructed via cumsum, then
    linearly interpolated to all input timestamps.

    Parameters
    ----------
    pred_vel    : (N, 2) global velocity predictions in m/s
    step_frames : (N,)   frame indices of predictions
    time        : (T,)   timestamps for all input frames

    Returns
    -------
    pos : (T, 2) trajectory in metres, starting at (0, 0)
    """
    n = len(pred_vel)
    if n == 0:
        _LOG.warning("No velocity predictions — returning zero trajectory")
        return np.zeros((len(time), 2))

    step_times = time[step_frames]
    dts = np.diff(step_times, prepend=step_times[0])

    # Cumulative position at each step
    pos_steps = np.zeros((n + 1, 2))
    pos_steps[1:] = np.cumsum(pred_vel * dts[:, None], axis=0)

    # Timestamps for the position points (prepend t=0 for the origin)
    t_ext = np.concatenate([[time[0] - 1e-9], step_times])

    # Interpolate to all input timestamps
    interp = interp1d(t_ext, pos_steps, axis=0, bounds_error=False,
                      fill_value=(pos_steps[0], pos_steps[-1]))
    return interp(time).astype(np.float64)


# ---------------------------------------------------------------------------
# Top-level inference
# ---------------------------------------------------------------------------

def infer(
    hdf5_path: Path,
    model_type: str,
    checkpoint_path: Path,
    ronin_source: Path,
    out_path: Path,
) -> np.ndarray:
    """
    Full inference pipeline: HDF5 → features → model → position trajectory.

    Parameters
    ----------
    hdf5_path       : HDF5 produced by himu_to_ronin.py
    model_type      : 'resnet', 'lstm', or 'tcn'
    checkpoint_path : path to the .pt checkpoint file
    ronin_source    : path to the RoNIN source/ directory
    out_path        : where to save the (T, 2) position .npy

    Returns
    -------
    pos : (T, 2) position trajectory in metres
    """
    features, time = compute_features(hdf5_path)

    if model_type == 'resnet':
        network   = load_resnet(checkpoint_path, ronin_source)
        pred_vel, step_frames = _run_resnet(
            network, features, _RESNET_WINDOW, _RESNET_STEP)
    elif model_type == 'lstm':
        network   = load_lstm(checkpoint_path, ronin_source)
        pred_vel, step_frames = _run_seq2seq(
            network, features, _LSTM_WINDOW, _LSTM_STEP)
    elif model_type == 'tcn':
        network   = load_tcn(checkpoint_path, ronin_source)
        pred_vel, step_frames = _run_seq2seq(
            network, features, _TCN_WINDOW, _TCN_STEP)
    else:
        raise ValueError(f"Unknown model type '{model_type}'. Choose resnet/lstm/tcn.")

    _LOG.info("%s: %d velocity predictions from %d input frames",
              model_type, len(pred_vel), len(features))

    pos = integrate_velocities(pred_vel, step_frames, time)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_path, pos)
    _LOG.info("Saved position trajectory to %s  shape=%s", out_path, pos.shape)
    return pos


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Run RoNIN inference on a HyperIMU HDF5 file."
    )
    parser.add_argument('--hdf5',         type=Path, required=True,
                        help="Input HDF5 file from himu_to_ronin.py.")
    parser.add_argument('--model',        type=str,  required=True,
                        choices=['resnet', 'lstm', 'tcn'],
                        help="Model architecture to use.")
    parser.add_argument('--checkpoint',   type=Path, required=True,
                        help="Path to the .pt checkpoint file.")
    parser.add_argument('--ronin-source', type=Path, required=True,
                        help="Path to the RoNIN source/ directory.")
    parser.add_argument('--out',          type=Path, required=True,
                        help="Output .npy path for (T, 2) position trajectory.")
    args = parser.parse_args(argv)

    infer(
        hdf5_path=args.hdf5,
        model_type=args.model,
        checkpoint_path=args.checkpoint,
        ronin_source=args.ronin_source,
        out_path=args.out,
    )


if __name__ == '__main__':
    main()
