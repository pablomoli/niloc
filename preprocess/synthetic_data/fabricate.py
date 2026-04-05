"""
Fabrication pipeline CLI entry point (issue #7).

Ties together the full fabrication pipeline:
  load GT paths -> load noise library -> inject noise -> write dataset

Usage
-----
    uv run python -m preprocess.synthetic_data.fabricate
    uv run python -m preprocess.synthetic_data.fabricate --config path/to/config.yaml
    uv run python -m preprocess.synthetic_data.fabricate \\
        --out-dir /tmp/out --seed 0 --n-trajectories 100

All paths in the YAML config are resolved relative to the current working
directory (i.e., the repository root when invoked with ``uv run``).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

import numpy as np
import yaml

from preprocess.synthetic_data.format_output import validate_outputs, write_dataset
from preprocess.synthetic_data.graph_path_generator import generate_paths
from preprocess.synthetic_data.inject_noise import fabricate, load_noise_library

_LOG = logging.getLogger(__name__)

_DEFAULT_CONFIG = (
    Path(__file__).parent / "configs" / "fabricate_avalon.yaml"
)


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_config(config_path: Path) -> dict:
    """
    Load and return the fabrication config from a YAML file.

    Parameters
    ----------
    config_path : path to the YAML configuration file

    Returns
    -------
    dict with all config keys
    """
    with open(config_path) as fh:
        cfg = yaml.safe_load(fh)
    return cfg


# ---------------------------------------------------------------------------
# GT path loading
# ---------------------------------------------------------------------------


def load_gt_paths(gt_paths_dir: Path, gt_glob: str) -> list[np.ndarray]:
    """
    Load all GT path files matching ``gt_glob`` inside ``gt_paths_dir``.

    Each file must have 5 columns (ts, smooth_x, smooth_y, gt_x, gt_y).
    Rows starting with ``#`` are treated as comments and skipped.

    Parameters
    ----------
    gt_paths_dir : directory containing GT path text files
    gt_glob      : glob pattern to match within the directory

    Returns
    -------
    list of (T, 5) float64 arrays
    """
    paths = sorted(gt_paths_dir.glob(gt_glob))
    if not paths:
        raise FileNotFoundError(
            f"No GT path files matched '{gt_glob}' in '{gt_paths_dir}'"
        )

    gt_list: list[np.ndarray] = []
    for p in paths:
        arr = np.loadtxt(p, comments="#")
        if arr.ndim == 1:
            arr = arr[np.newaxis, :]
        if arr.shape[1] != 5:
            raise ValueError(
                f"Expected 5 columns in '{p}', got {arr.shape[1]}"
            )
        gt_list.append(arr.astype(np.float64))
        _LOG.debug("Loaded GT path %s — %d frames", p.name, len(arr))

    _LOG.info("Loaded %d GT paths from '%s'", len(gt_list), gt_paths_dir)
    return gt_list


# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fabricate",
        description="Fabricate synthetic noisy trajectories for NILOC training.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=_DEFAULT_CONFIG,
        help="Path to YAML configuration file (default: configs/fabricate_avalon.yaml)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Override the output directory from the config.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Override the random seed from the config.",
    )
    parser.add_argument(
        "--n-trajectories",
        type=int,
        default=None,
        help="Override the number of fabricated trajectories from the config.",
    )
    return parser


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run(cfg: dict) -> int:
    """
    Execute the fabrication pipeline from a resolved config dict.

    Parameters
    ----------
    cfg : configuration dict (after CLI overrides have been applied)

    Returns
    -------
    exit code — 0 on success, 1 if validation fails
    """
    t0 = time.monotonic()

    # Resolve paths relative to cwd
    cwd = Path.cwd()
    noise_library_path = cwd / cfg["noise_library"]
    out_dir = cwd / cfg["out_dir"]

    # -- 1. Load or generate GT paths --------------------------------------
    path_generator = cfg.get("path_generator", "density_map")
    if path_generator == "graph":
        graph_path = cwd / cfg["graph_path"]
        n_gt_paths: int = cfg["n_gt_paths"]
        _LOG.info(
            "Generating %d GT paths from graph '%s'", n_gt_paths, graph_path
        )
        gt_rng = np.random.default_rng(cfg["seed"])
        gt_paths = generate_paths(
            n_paths=n_gt_paths,
            graph_path=graph_path,
            freq=cfg["freq"],
            avg_speed_px_s=cfg.get("avg_speed_px_s", 5.0),
            min_frames=cfg.get("min_frames", 60),
            rng=gt_rng,
        )
    else:
        gt_paths_dir = cwd / cfg["gt_paths_dir"]
        _LOG.info(
            "Loading GT paths from '%s' (glob: %s)", gt_paths_dir, cfg["gt_glob"]
        )
        gt_paths = load_gt_paths(gt_paths_dir, cfg["gt_glob"])

    # -- 2. Load noise library ---------------------------------------------
    _LOG.info("Loading noise library from '%s'", noise_library_path)
    segments, meta = load_noise_library(noise_library_path)
    _LOG.info(
        "Noise library: %d segments, window=%d, meta entries=%d",
        len(segments),
        segments.shape[1],
        len(meta),
    )

    # -- 3. Fabricate trajectories -----------------------------------------
    rng = np.random.default_rng(cfg["seed"])
    n_out: int = cfg["n_trajectories"]
    _LOG.info(
        "Fabricating %d trajectories (aug_mult=%d, seed=%s) ...",
        n_out,
        cfg["aug_mult"],
        cfg["seed"],
    )
    motion_typed = cfg.get("motion_typed_noise", False)
    results = fabricate(
        gt_paths=gt_paths,
        segments=segments,
        n_out=n_out,
        aug_mult=cfg["aug_mult"],
        target_dpi=cfg["target_dpi"],
        rng=rng,
        meta=meta if motion_typed else None,
        freq=cfg["freq"],
    )
    _LOG.info("Fabrication complete — %d trajectories produced", len(results))

    # -- 4. Write dataset --------------------------------------------------
    _LOG.info("Writing dataset to '%s' ...", out_dir)
    summary = write_dataset(
        results=results,
        out_dir=out_dir,
        file_tag=cfg["file_tag"],
        freq=cfg["freq"],
    )
    _LOG.info("Dataset written successfully")

    # -- 5. Validate outputs (optional) ------------------------------------
    exit_code = 0
    if cfg.get("validate", False):
        _LOG.info("Validating outputs (n_check=%d) ...", cfg.get("n_validate", 10))
        errors = validate_outputs(out_dir, n_check=cfg.get("n_validate", 10))
        if errors:
            _LOG.error("Validation FAILED — %d error(s):", len(errors))
            for err in errors:
                _LOG.error("  %s", err)
            exit_code = 1
        else:
            _LOG.info("Validation passed — all spot-checked files are clean")

    # -- 6. Print summary --------------------------------------------------
    elapsed = time.monotonic() - t0
    print(
        f"\n--- Fabrication summary ---\n"
        f"  n_trajectories : {summary['n_trajectories']}\n"
        f"  total_frames   : {summary['total_frames']}\n"
        f"  mean_drift_px  : {summary['mean_drift_px']:.3f}\n"
        f"  output dir     : {out_dir}\n"
        f"  elapsed        : {elapsed:.1f}s\n"
        f"  summary JSON   : {out_dir / 'summary.json'}"
    )

    if exit_code != 0:
        print("\nValidation errors were found — see log output above.", file=sys.stderr)

    return exit_code


def main(argv: list[str] | None = None) -> int:
    """
    CLI entry point.

    Parameters
    ----------
    argv : argument list (defaults to sys.argv when None)

    Returns
    -------
    exit code
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = _build_parser()
    args = parser.parse_args(argv)

    # Load base config
    cfg = load_config(args.config)

    # Apply CLI overrides
    if args.out_dir is not None:
        cfg["out_dir"] = str(args.out_dir)
    if args.seed is not None:
        cfg["seed"] = args.seed
    if args.n_trajectories is not None:
        cfg["n_trajectories"] = args.n_trajectories

    _LOG.info("Config loaded from '%s'", args.config)
    _LOG.info(
        "Run parameters: n_trajectories=%d, seed=%s, out_dir=%s",
        cfg["n_trajectories"],
        cfg["seed"],
        cfg["out_dir"],
    )

    return run(cfg)


if __name__ == "__main__":
    sys.exit(main())
