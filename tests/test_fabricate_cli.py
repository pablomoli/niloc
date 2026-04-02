"""Tests for preprocess/synthetic_data/fabricate.py (issue #7)."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
import yaml

from preprocess.synthetic_data.fabricate import load_config, load_gt_paths, main

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

NOISE_WINDOW = 150


def _make_gt_path(n_frames: int = 60, seed: int = 0) -> np.ndarray:
    """Synthetic A* output: ts, x, y, gt_x, gt_y where x == gt_x."""
    rng = np.random.default_rng(seed)
    ts = np.arange(n_frames, dtype=float)
    dx = np.cumsum(rng.normal(0.5, 0.1, n_frames))
    dy = np.cumsum(rng.normal(0.1, 0.05, n_frames))
    return np.stack([ts, dx, dy, dx, dy], axis=1)


def _make_noise_library(
    n_segments: int = 50,
    window: int = NOISE_WINDOW,
    seed: int = 42,
) -> np.ndarray:
    """Small synthetic noise library for fast tests."""
    rng = np.random.default_rng(seed)
    increments = rng.normal(0, 0.5, (n_segments, window, 2))
    segments = np.cumsum(increments, axis=1).astype(np.float32)
    segments -= segments[:, :1, :]
    return segments


def _write_gt_files(directory: Path, n_files: int = 4) -> list[Path]:
    """Write synthetic GT path text files into directory."""
    written = []
    for i in range(n_files):
        arr = _make_gt_path(n_frames=80, seed=i)
        p = directory / f"floorplan_avalon_run_{i:02d}_agent0.txt"
        header = "ts_seconds,smooth_x,smooth_y,gt_x,gt_y"
        np.savetxt(p, arr, header=header, comments="# ")
        written.append(p)
    return written


def _write_noise_library(directory: Path) -> Path:
    """Write a small noise library .npy file."""
    segments = _make_noise_library()
    npy_path = directory / "noise_library.npy"
    np.save(npy_path, segments)
    return npy_path


def _write_config(
    directory: Path,
    gt_paths_dir: Path,
    noise_library: Path,
    out_dir: Path,
    n_trajectories: int = 8,
    seed: int = 0,
    validate: bool = False,
) -> Path:
    """Write a minimal YAML config and return its path."""
    cfg = {
        "gt_paths_dir": str(gt_paths_dir),
        "gt_glob": "floorplan_avalon_*.txt",
        "noise_library": str(noise_library),
        "source_dpi": 2.5,
        "target_dpi": 10.0,
        "n_trajectories": n_trajectories,
        "aug_mult": 2,
        "freq": 1.0,
        "file_tag": "fab",
        "seed": seed,
        "out_dir": str(out_dir),
        "validate": validate,
        "n_validate": 3,
    }
    config_path = directory / "test_config.yaml"
    config_path.write_text(yaml.dump(cfg))
    return config_path


# ---------------------------------------------------------------------------
# 1. Config loads correctly from YAML
# ---------------------------------------------------------------------------


class TestLoadConfig:
    def test_all_keys_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = _write_config(
                Path(tmp),
                gt_paths_dir=Path(tmp) / "gt",
                noise_library=Path(tmp) / "lib.npy",
                out_dir=Path(tmp) / "out",
            )
            cfg = load_config(config_path)

        assert cfg["n_trajectories"] == 8
        assert cfg["aug_mult"] == 2
        assert cfg["source_dpi"] == pytest.approx(2.5)
        assert cfg["target_dpi"] == pytest.approx(10.0)
        assert cfg["seed"] == 0
        assert cfg["file_tag"] == "fab"
        assert cfg["validate"] is False

    def test_default_config_is_valid_yaml(self) -> None:
        default = (
            Path(__file__).parent.parent
            / "preprocess"
            / "synthetic_data"
            / "configs"
            / "fabricate_avalon.yaml"
        )
        cfg = load_config(default)
        assert "gt_paths_dir" in cfg
        assert "noise_library" in cfg
        assert cfg["n_trajectories"] == 500
        assert cfg["seed"] == 42

    def test_missing_file_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_config(Path("/nonexistent/config.yaml"))


# ---------------------------------------------------------------------------
# 2. CLI runs end-to-end and produces output files
# ---------------------------------------------------------------------------


class TestEndToEnd:
    def test_output_files_created(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(tmp_path, gt_dir, npy_path, out_dir)

            rc = main(["--config", str(config)])

        assert rc == 0

    def test_correct_number_of_trajectories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(tmp_path, gt_dir, npy_path, out_dir, n_trajectories=10)

            main(["--config", str(config)])
            fab_files = list(out_dir.glob("fab_*.txt"))

        assert len(fab_files) == 10

    def test_summary_json_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(tmp_path, gt_dir, npy_path, out_dir, n_trajectories=5)

            main(["--config", str(config)])
            summary_path = out_dir / "summary.json"
            assert summary_path.exists()
            summary = json.loads(summary_path.read_text())

        assert summary["n_trajectories"] == 5
        assert "total_frames" in summary
        assert "mean_drift_px" in summary


# ---------------------------------------------------------------------------
# 3. --out-dir override works
# ---------------------------------------------------------------------------


class TestOutDirOverride:
    def test_override_changes_output_location(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            config_out = tmp_path / "original_out"
            override_out = tmp_path / "override_out"
            config = _write_config(tmp_path, gt_dir, npy_path, config_out)

            main(["--config", str(config), "--out-dir", str(override_out)])

            assert not config_out.exists(), "Original out_dir should not have been created"
            assert (override_out / "summary.json").exists()

    def test_n_trajectories_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=100
            )

            main([
                "--config", str(config),
                "--out-dir", str(out_dir),
                "--n-trajectories", "6",
            ])
            fab_files = list(out_dir.glob("fab_*.txt"))

        assert len(fab_files) == 6


# ---------------------------------------------------------------------------
# 4. --seed produces deterministic output
# ---------------------------------------------------------------------------


class TestDeterministicSeed:
    def _run_with_seed(self, seed: int) -> np.ndarray:
        """Run the pipeline and return the first trajectory's noisy column."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir, n_files=3)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=5, seed=seed
            )
            main(["--config", str(config)])
            first = np.loadtxt(out_dir / "fab_0000.txt", comments="#")
        return first

    def test_same_seed_same_output(self) -> None:
        a = self._run_with_seed(7)
        b = self._run_with_seed(7)
        np.testing.assert_array_equal(a, b)

    def test_different_seeds_differ(self) -> None:
        a = self._run_with_seed(7)
        b = self._run_with_seed(99)
        assert not np.allclose(a, b)


# ---------------------------------------------------------------------------
# 5. Validation errors cause exit code 1
# ---------------------------------------------------------------------------


class TestValidationErrors:
    def test_exit_code_1_on_validation_failure(self) -> None:
        """Patch validate_outputs to return errors and verify exit code 1."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=5, validate=True
            )
            with patch(
                "preprocess.synthetic_data.fabricate.validate_outputs",
                return_value=["fab_0000: x == gt_x (noise not applied)"],
            ):
                rc = main(["--config", str(config)])

        assert rc == 1

    def test_exit_code_0_when_validation_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=5, validate=True
            )
            with patch(
                "preprocess.synthetic_data.fabricate.validate_outputs",
                return_value=[],
            ):
                rc = main(["--config", str(config)])

        assert rc == 0


# ---------------------------------------------------------------------------
# 6. Summary JSON written to output dir
# ---------------------------------------------------------------------------


class TestSummaryJson:
    def test_summary_has_required_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=4
            )
            main(["--config", str(config)])
            summary = json.loads((out_dir / "summary.json").read_text())

        required = {
            "n_trajectories",
            "total_frames",
            "mean_drift_px",
            "median_drift_px",
            "p95_drift_px",
            "file_tag",
            "freq_hz",
        }
        assert required <= summary.keys()

    def test_summary_n_trajectories_matches_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=7
            )
            main(["--config", str(config)])
            summary = json.loads((out_dir / "summary.json").read_text())

        assert summary["n_trajectories"] == 7

    def test_mean_drift_positive(self) -> None:
        """Noise injection must produce non-zero drift."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gt_dir = tmp_path / "gt"
            gt_dir.mkdir()
            _write_gt_files(gt_dir)
            npy_path = _write_noise_library(tmp_path)
            out_dir = tmp_path / "out"
            config = _write_config(
                tmp_path, gt_dir, npy_path, out_dir, n_trajectories=5
            )
            main(["--config", str(config)])
            summary = json.loads((out_dir / "summary.json").read_text())

        assert summary["mean_drift_px"] > 0


# ---------------------------------------------------------------------------
# 7. load_gt_paths edge cases
# ---------------------------------------------------------------------------


class TestLoadGtPaths:
    def test_no_matching_files_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, pytest.raises(FileNotFoundError):
            load_gt_paths(Path(tmp), "floorplan_avalon_*.txt")

    def test_returns_list_of_arrays(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            _write_gt_files(tmp_path, n_files=3)
            result = load_gt_paths(tmp_path, "floorplan_avalon_*.txt")

        assert len(result) == 3
        for arr in result:
            assert arr.ndim == 2
            assert arr.shape[1] == 5
