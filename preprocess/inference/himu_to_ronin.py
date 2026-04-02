"""
Convert a HyperIMU CSV recording to a RoNIN-compatible HDF5 file.

HyperIMU CSV format (default 100ms / 10 Hz):
  Lines beginning with '@' are comments (app header).
  Column header line begins with 'icm' — also skipped.
  Data columns (0-based indices):
    0-2   accel x, y, z   (m/s²)
    3-5   magnetometer x, y, z  (not used by RoNIN)
    6-8   orientation x (azimuth deg), y (pitch deg), z (roll deg)
    9-11  gyro x, y, z    (rad/s)

RoNIN HDF5 output (200 Hz):
  synced/time     (T,)    timestamps in seconds
  synced/acce     (T, 3)  accelerometer m/s²
  synced/gyro     (T, 3)  gyroscope rad/s
  synced/game_rv  (T, 4)  quaternion [w, x, y, z]

Upsampling from source Hz to 200 Hz:
  - accel and gyro: linear interpolation per axis
  - orientation: SLERP on quaternions (avoids Euler wrap-around artifacts)

Android TYPE_ORIENTATION convention:
  azimuth (x) — rotation around -Z: 0=North, 90=East, range 0-360
  pitch   (y) — rotation around  X: nose-down positive, range -180..180
  roll    (z) — rotation around  Y: left-side-up positive, range -90..90
Decomposed as intrinsic ZXY rotations → Rotation.from_euler('ZXY', [-az, pitch, roll]).

Usage
-----
  uv run python -m preprocess.inference.himu_to_ronin \\
      --csv HIMU-2026-03-25_17-55-25.csv \\
      --out outputs/ronin_input/session_001.hdf5

  uv run python -m preprocess.inference.himu_to_ronin \\
      --csv recordings/walk.csv --out outputs/ronin_input/walk.hdf5 \\
      --source-hz 10 --target-hz 200
"""

from __future__ import annotations

import argparse
import contextlib
import logging
from pathlib import Path

import h5py
import numpy as np
from scipy.spatial.transform import Rotation, Slerp

_LOG = logging.getLogger(__name__)

SOURCE_HZ: float = 10.0   # HyperIMU default (100 ms sampling)
TARGET_HZ: float = 200.0  # RoNIN expected sample rate

# Column indices in the 12-column HIMU data row
_ACCE_COLS = [0, 1, 2]
_ORI_COLS  = [6, 7, 8]   # azimuth, pitch, roll — degrees
_GYRO_COLS = [9, 10, 11]


def parse_himu_csv(csv_path: Path) -> np.ndarray:
    """
    Parse a HyperIMU CSV file and return a (N, 12) float64 array.

    Lines starting with '@' or a sensor name prefix are treated as headers
    and skipped. Any row that does not parse cleanly to at least 12 columns
    is silently dropped.

    Parameters
    ----------
    csv_path : path to the HyperIMU CSV file

    Returns
    -------
    (N, 12) float64 array — one row per sample
    """
    rows: list[list[float]] = []
    with open(csv_path) as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped or stripped.startswith('@'):
                continue
            # Column header line starts with 'icm' or 'mmc'
            if stripped[0].isalpha():
                continue
            parts = stripped.split(',')
            if len(parts) < 12:
                continue
            with contextlib.suppress(ValueError):
                rows.append([float(p) for p in parts[:12]])

    if not rows:
        raise ValueError(f"No valid data rows found in '{csv_path}'")

    return np.array(rows, dtype=np.float64)


def _build_quaternions(azimuth_deg: np.ndarray,
                       pitch_deg: np.ndarray,
                       roll_deg: np.ndarray) -> Rotation:
    """
    Convert Android TYPE_ORIENTATION Euler angles to a Rotation object.

    Decomposition: intrinsic ZXY with azimuth negated (CW→CCW convention).
    Returns a Rotation instance suitable for Slerp.
    """
    angles = np.stack([-azimuth_deg, pitch_deg, roll_deg], axis=-1)
    return Rotation.from_euler('ZXY', angles, degrees=True)


def upsample(
    data: np.ndarray,
    source_hz: float = SOURCE_HZ,
    target_hz: float = TARGET_HZ,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Upsample HIMU sensor data from source_hz to target_hz.

    Parameters
    ----------
    data      : (N, 12) array from parse_himu_csv
    source_hz : original sample rate in Hz
    target_hz : desired output sample rate in Hz

    Returns
    -------
    t_tgt    : (M,) timestamps in seconds at target_hz
    acce_tgt : (M, 3) accelerometer
    gyro_tgt : (M, 3) gyroscope
    game_rv  : (M, 4) quaternion [w, x, y, z]
    """
    n = len(data)
    dt_src = 1.0 / source_hz
    t_src = np.arange(n) * dt_src

    dt_tgt = 1.0 / target_hz
    t_tgt = np.arange(0, t_src[-1] + dt_tgt * 0.5, dt_tgt)

    # Linear interpolation for accel and gyro
    acce_src = data[:, _ACCE_COLS]
    gyro_src = data[:, _GYRO_COLS]
    acce_tgt = np.stack(
        [np.interp(t_tgt, t_src, acce_src[:, i]) for i in range(3)], axis=-1
    )
    gyro_tgt = np.stack(
        [np.interp(t_tgt, t_src, gyro_src[:, i]) for i in range(3)], axis=-1
    )

    # SLERP for quaternion orientation
    ori = data[:, _ORI_COLS]
    rots_src = _build_quaternions(ori[:, 0], ori[:, 1], ori[:, 2])
    slerp = Slerp(t_src, rots_src)
    rots_tgt = slerp(t_tgt)

    # scipy Rotation.as_quat() returns [x, y, z, w]; RoNIN expects [w, x, y, z]
    xyzw = rots_tgt.as_quat()
    game_rv = np.roll(xyzw, shift=1, axis=-1)

    return (
        t_tgt,
        acce_tgt.astype(np.float64),
        gyro_tgt.astype(np.float64),
        game_rv.astype(np.float64),
    )


def write_hdf5(
    out_path: Path,
    t: np.ndarray,
    acce: np.ndarray,
    gyro: np.ndarray,
    game_rv: np.ndarray,
) -> None:
    """Write the four synced arrays to a RoNIN-compatible HDF5 file."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with h5py.File(out_path, 'w') as f:
        grp = f.create_group('synced')
        grp.create_dataset('time',    data=t)
        grp.create_dataset('acce',    data=acce)
        grp.create_dataset('gyro',    data=gyro)
        grp.create_dataset('game_rv', data=game_rv)


def convert(
    csv_path: Path,
    out_path: Path,
    source_hz: float = SOURCE_HZ,
    target_hz: float = TARGET_HZ,
) -> None:
    """
    Full conversion: HyperIMU CSV → RoNIN HDF5.

    Parameters
    ----------
    csv_path  : input HyperIMU CSV file
    out_path  : output HDF5 path (parent directories created if needed)
    source_hz : input sample rate (default 10 Hz for HyperIMU 100ms mode)
    target_hz : output sample rate (default 200 Hz for RoNIN)
    """
    _LOG.info("Parsing '%s' ...", csv_path)
    data = parse_himu_csv(csv_path)
    _LOG.info("  %d frames @ %.0f Hz", len(data), source_hz)

    t, acce, gyro, game_rv = upsample(data, source_hz=source_hz, target_hz=target_hz)
    _LOG.info("  upsampled to %d frames @ %.0f Hz", len(t), target_hz)

    write_hdf5(out_path, t, acce, gyro, game_rv)
    _LOG.info("  saved '%s'  shape: acce=%s  game_rv=%s", out_path, acce.shape, game_rv.shape)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Convert a HyperIMU CSV to a RoNIN-compatible HDF5 file."
    )
    parser.add_argument('--csv',        type=Path, required=True,
                        help="Input HyperIMU CSV file.")
    parser.add_argument('--out',        type=Path, required=True,
                        help="Output HDF5 path.")
    parser.add_argument('--source-hz',  type=float, default=SOURCE_HZ,
                        help=f"Input sample rate in Hz (default: {SOURCE_HZ}).")
    parser.add_argument('--target-hz',  type=float, default=TARGET_HZ,
                        help=f"Output sample rate in Hz (default: {TARGET_HZ}).")
    args = parser.parse_args(argv)
    convert(args.csv, args.out, source_hz=args.source_hz, target_hz=args.target_hz)


if __name__ == '__main__':
    main()
