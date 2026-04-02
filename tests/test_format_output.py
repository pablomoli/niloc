"""Tests for preprocess/synthetic_data/format_output.py."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np

from preprocess.synthetic_data.format_output import validate_outputs, write_dataset

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_results(n: int = 5, T: int = 400, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    results = []
    for i in range(n):
        gt_xy = rng.uniform(10, 150, (T, 2)).astype(np.float64)
        noise  = np.cumsum(rng.normal(0, 0.3, (T, 2)), axis=0)
        results.append({
            "ts":          np.arange(T, dtype=np.float64),
            "noisy_xy":    gt_xy + noise,
            "gt_xy":       gt_xy,
            "seg_idx":     int(rng.integers(100)),
            "gt_path_idx": i % 3,
        })
    return results


# ---------------------------------------------------------------------------
# write_dataset
# ---------------------------------------------------------------------------


class TestWriteDataset:
    def test_creates_output_files(self) -> None:
        results = _make_results(5)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            txts = list(out.glob("fab_*.txt"))
            assert len(txts) == 5

    def test_creates_train_txt(self) -> None:
        results = _make_results(4)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            stems = (out / "train.txt").read_text().splitlines()
            assert len(stems) == 4

    def test_creates_empty_val_and_test(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            assert (out / "val.txt").read_text() == ""
            assert (out / "test.txt").read_text() == ""

    def test_file_has_five_columns(self) -> None:
        results = _make_results(1)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            stem = (out / "train.txt").read_text().splitlines()[0]
            data = np.loadtxt(out / f"{stem}.txt", comments="#")
            assert data.shape[1] == 5

    def test_noise_applied_x_ne_gt_x(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            for stem in (out / "train.txt").read_text().splitlines():
                data = np.loadtxt(out / f"{stem}.txt", comments="#")
                assert not np.allclose(data[:, 1], data[:, 3]), \
                    f"{stem}: x == gt_x (noise not applied)"

    def test_timestamps_start_at_zero(self) -> None:
        results = _make_results(2)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out, freq=10.0)
            for stem in (out / "train.txt").read_text().splitlines():
                data = np.loadtxt(out / f"{stem}.txt", comments="#")
                assert np.isclose(data[0, 0], 0.0)

    def test_timestamps_monotonic(self) -> None:
        results = _make_results(2)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out, freq=10.0)
            for stem in (out / "train.txt").read_text().splitlines():
                data = np.loadtxt(out / f"{stem}.txt", comments="#")
                assert np.all(np.diff(data[:, 0]) > 0)

    def test_freq_sets_timestamp_step(self) -> None:
        results = _make_results(1, T=100)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out, freq=5.0)
            stem = (out / "train.txt").read_text().splitlines()[0]
            data = np.loadtxt(out / f"{stem}.txt", comments="#")
            np.testing.assert_allclose(np.diff(data[:, 0]), 1.0 / 5.0, rtol=1e-9)

    def test_custom_file_tag(self) -> None:
        results = _make_results(2)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out, file_tag="syn")
            txts = list(out.glob("syn_*.txt"))
            assert len(txts) == 2

    def test_summary_json_written(self) -> None:
        results = _make_results(5)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            summary = write_dataset(results, out)
            assert (out / "summary.json").exists()
            loaded = json.loads((out / "summary.json").read_text())
            assert loaded["n_trajectories"] == 5
            assert summary["n_trajectories"] == 5

    def test_summary_total_frames(self) -> None:
        T = 400
        results = _make_results(3, T=T)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            summary = write_dataset(results, out)
            assert summary["total_frames"] == 3 * T

    def test_no_nan_in_output(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            for stem in (out / "train.txt").read_text().splitlines():
                data = np.loadtxt(out / f"{stem}.txt", comments="#")
                assert np.all(np.isfinite(data))

    def test_train_stems_have_no_extension(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            for stem in (out / "train.txt").read_text().splitlines():
                assert not stem.endswith(".txt"), f"stem should not include extension: {stem}"

    def test_creates_output_dir_if_absent(self) -> None:
        results = _make_results(1)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "nested" / "dir"
            assert not out.exists()
            write_dataset(results, out)
            assert out.exists()


# ---------------------------------------------------------------------------
# validate_outputs
# ---------------------------------------------------------------------------


class TestValidateOutputs:
    def test_valid_dataset_passes(self) -> None:
        results = _make_results(5)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            errors = validate_outputs(out)
            assert errors == [], f"Unexpected errors: {errors}"

    def test_missing_train_txt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            errors = validate_outputs(Path(tmp))
            assert any("train.txt" in e for e in errors)

    def test_detects_x_eq_gt_x(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            # Corrupt one file by copying gt_x into x
            stems = (out / "train.txt").read_text().splitlines()
            bad = out / f"{stems[0]}.txt"
            data = np.loadtxt(bad, comments="#")
            data[:, 1] = data[:, 3]  # x = gt_x
            np.savetxt(bad, data, header="ts_seconds,x,y,gt_x,gt_y", comments="# ")
            errors = validate_outputs(out, n_check=len(stems))
            assert any("gt_x" in e or "noise" in e for e in errors)

    def test_detects_nan(self) -> None:
        results = _make_results(3)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_dataset(results, out)
            stems = (out / "train.txt").read_text().splitlines()
            bad = out / f"{stems[0]}.txt"
            data = np.loadtxt(bad, comments="#")
            data[5, 2] = np.nan
            np.savetxt(bad, data, header="ts_seconds,x,y,gt_x,gt_y", comments="# ")
            errors = validate_outputs(out, n_check=len(stems))
            assert any("NaN" in e or "Inf" in e for e in errors)
