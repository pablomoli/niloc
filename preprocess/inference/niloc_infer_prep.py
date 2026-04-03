"""
Resample niloc_input .txt files from RoNIN output rate to 1 Hz.

RoNIN inference produces positions at 200 Hz (HyperIMU 10 Hz upsampled to 200 Hz).
The Avalon NILOC model was trained on 1 Hz fabricated data. This script subsamples
every (source_hz / target_hz)-th row and converts the timestamp column from sample
index to seconds.

Input format (one row per frame):
    ts   vio_x   vio_y   gt_x   gt_y
    (ts is sample index, positions in pixels, gt columns are zeros at inference)

Output format: identical, with ts in seconds at target_hz.

Usage
-----
    uv run python -m preprocess.inference.niloc_infer_prep \
        --input-dir  outputs/niloc_input \
        --output-dir outputs/niloc_input_1hz \
        --source-hz  200
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np

_LOG = logging.getLogger(__name__)


def resample(
    input_path: Path,
    output_path: Path,
    source_hz: float,
    target_hz: float = 1.0,
) -> None:
    """
    Subsample a single niloc_input .txt file from source_hz to target_hz.

    Parameters
    ----------
    input_path  : 5-column niloc_input .txt file at source_hz
    output_path : destination .txt path (parent dirs created if needed)
    source_hz   : frame rate of the input file (e.g. 200.0)
    target_hz   : desired output frame rate (default 1.0 Hz)
    """
    step = int(round(source_hz / target_hz))
    data = np.loadtxt(input_path)

    indices = np.arange(0, len(data), step)
    downsampled = data[indices].copy()

    # Replace sample-index timestamps with seconds
    downsampled[:, 0] = indices / source_hz

    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savetxt(output_path, downsampled, fmt="%.6f", delimiter=" ")

    _LOG.info(
        "%s: %d -> %d rows  (%.0f Hz -> %.0f Hz)",
        input_path.name, len(data), len(downsampled), source_hz, target_hz,
    )


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Resample niloc_input .txt files from RoNIN rate to 1 Hz."
    )
    parser.add_argument("--input-dir",  type=Path, required=True,
                        help="Directory of .txt files at source-hz.")
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="Directory for resampled output .txt files.")
    parser.add_argument("--source-hz",  type=float, default=200.0,
                        help="Frame rate of input files (default: 200).")
    parser.add_argument("--target-hz",  type=float, default=1.0,
                        help="Desired output frame rate (default: 1).")
    args = parser.parse_args(argv)

    txt_files = sorted(args.input_dir.glob("*.txt"))
    if not txt_files:
        _LOG.warning("No .txt files found in %s", args.input_dir)
        return

    for src in txt_files:
        resample(src, args.output_dir / src.name, args.source_hz, args.target_hz)

    _LOG.info("Done. %d files written to %s", len(txt_files), args.output_dir)


if __name__ == "__main__":
    main()
