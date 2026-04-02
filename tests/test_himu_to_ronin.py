"""Tests for preprocess.inference.himu_to_ronin."""

from __future__ import annotations

import textwrap
from pathlib import Path

import h5py
import numpy as np
import pytest

from preprocess.inference.himu_to_ronin import (
    _build_quaternions,
    convert,
    parse_himu_csv,
    upsample,
    write_hdf5,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HEADER = textwrap.dedent("""\
    @ HyperIMU - ianovir
    @ Date:Wed Mar 25 17:55:25 EDT 2026, Sampling Rate:100ms
    icm45631_accelerometer.x,icm45631_accelerometer.y,icm45631_accelerometer.z,mmc5616_magnetometer.x,mmc5616_magnetometer.y,mmc5616_magnetometer.z,orientation_sensor.x,orientation_sensor.y,orientation_sensor.z,icm45631_gyroscope.x,icm45631_gyroscope.y,icm45631_gyroscope.z
""")


def _make_csv(tmp_path: Path, n_rows: int = 20, source_hz: float = 10.0) -> Path:
    """Write a minimal synthetic HIMU CSV file."""
    rng = np.random.default_rng(0)
    p = tmp_path / "test.csv"
    rows = []
    for i in range(n_rows):
        acce = rng.uniform(-2, 2, 3).tolist()
        mag  = rng.uniform(-50, 50, 3).tolist()
        ori  = [float(i * 5 % 360), rng.uniform(-10, 10), rng.uniform(-5, 5)]
        gyro = rng.uniform(-0.5, 0.5, 3).tolist()
        rows.append(",".join(f"{v:.6f}" for v in acce + mag + ori + gyro))
    p.write_text(_HEADER + "\n".join(rows) + "\n")
    return p


# ---------------------------------------------------------------------------
# parse_himu_csv
# ---------------------------------------------------------------------------

class TestParseHimuCsv:
    def test_returns_correct_shape(self, tmp_path):
        csv = _make_csv(tmp_path, n_rows=30)
        data = parse_himu_csv(csv)
        assert data.shape == (30, 12)
        assert data.dtype == np.float64

    def test_skips_header_lines(self, tmp_path):
        csv = _make_csv(tmp_path, n_rows=10)
        data = parse_himu_csv(csv)
        assert len(data) == 10

    def test_empty_file_raises(self, tmp_path):
        csv = tmp_path / "empty.csv"
        csv.write_text("@ header only\n")
        with pytest.raises(ValueError, match="No valid data rows"):
            parse_himu_csv(csv)

    def test_real_himu_file(self):
        """Parse the actual HIMU sample file in the repo root."""
        p = Path("HIMU-2026-03-25_17-55-25.csv")
        if not p.exists():
            pytest.skip("HIMU sample file not present")
        data = parse_himu_csv(p)
        assert data.shape[1] == 12
        assert len(data) > 0
        assert np.all(np.isfinite(data))


# ---------------------------------------------------------------------------
# _build_quaternions
# ---------------------------------------------------------------------------

class TestBuildQuaternions:
    def test_identity_at_zero(self):
        # azimuth=0, pitch=0, roll=0 should give identity-ish quaternion
        r = _build_quaternions(
            np.array([0.0]), np.array([0.0]), np.array([0.0])
        )
        q = r.as_quat()   # [x, y, z, w]
        assert abs(abs(q[0, 3]) - 1.0) < 1e-9   # w ≈ ±1

    def test_output_length_matches_input(self):
        n = 50
        az = np.linspace(0, 180, n)
        r  = _build_quaternions(az, np.zeros(n), np.zeros(n))
        assert len(r) == n

    def test_quaternions_are_unit(self):
        rng = np.random.default_rng(1)
        az  = rng.uniform(0, 360, 40)
        pit = rng.uniform(-30, 30, 40)
        rol = rng.uniform(-20, 20, 40)
        r   = _build_quaternions(az, pit, rol)
        norms = np.linalg.norm(r.as_quat(), axis=-1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-9)


# ---------------------------------------------------------------------------
# upsample
# ---------------------------------------------------------------------------

class TestUpsample:
    def _data(self, n: int = 20) -> np.ndarray:
        rng = np.random.default_rng(7)
        data = np.zeros((n, 12))
        data[:, :3]  = rng.uniform(-2, 2, (n, 3))   # acce
        data[:, 6]   = np.linspace(0, 90, n)         # azimuth
        data[:, 7:9] = rng.uniform(-5, 5, (n, 2))    # pitch, roll
        data[:, 9:]  = rng.uniform(-0.3, 0.3, (n, 3)) # gyro
        return data

    def test_output_length(self):
        data = self._data(20)
        t, _acce, _gyro, _game_rv = upsample(data, source_hz=10.0, target_hz=200.0)
        expected = int((19 / 10.0) * 200.0) + 1
        assert abs(len(t) - expected) <= 2

    def test_shapes_consistent(self):
        data = self._data(20)
        t, acce, gyro, game_rv = upsample(data)
        m = len(t)
        assert acce.shape   == (m, 3)
        assert gyro.shape   == (m, 3)
        assert game_rv.shape == (m, 4)

    def test_game_rv_unit_quaternions(self):
        data = self._data(30)
        _, _, _, game_rv = upsample(data)
        norms = np.linalg.norm(game_rv, axis=-1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-9)

    def test_timestamps_monotonic(self):
        data = self._data(20)
        t, _, _, _ = upsample(data)
        assert np.all(np.diff(t) > 0)

    def test_no_nan_in_output(self):
        data = self._data(20)
        t, acce, gyro, game_rv = upsample(data)
        for arr in (t, acce, gyro, game_rv):
            assert np.all(np.isfinite(arr))

    def test_game_rv_wxyz_ordering(self):
        # w component is game_rv[:, 0]; for small angles w should be close to 1
        data = self._data(10)
        data[:, 6:9] = 0.0   # zero orientation
        _, _, _, game_rv = upsample(data)
        # w ≈ 1 when all Euler angles are 0
        assert np.all(np.abs(game_rv[:, 0]) > 0.9)


# ---------------------------------------------------------------------------
# write_hdf5
# ---------------------------------------------------------------------------

class TestWriteHdf5:
    def test_creates_expected_keys(self, tmp_path):
        n = 50
        t  = np.arange(n, dtype=np.float64) * 0.005
        a  = np.zeros((n, 3))
        g  = np.zeros((n, 3))
        rv = np.tile([1.0, 0.0, 0.0, 0.0], (n, 1))
        out = tmp_path / "test.hdf5"
        write_hdf5(out, t, a, g, rv)
        with h5py.File(out) as f:
            for key in ('synced/time', 'synced/acce', 'synced/gyro', 'synced/game_rv'):
                assert key in f, f"missing key {key}"

    def test_shapes_preserved(self, tmp_path):
        n = 40
        t  = np.arange(n, dtype=np.float64)
        a  = np.ones((n, 3))
        g  = np.ones((n, 3))
        rv = np.tile([1.0, 0.0, 0.0, 0.0], (n, 1))
        out = tmp_path / "test.hdf5"
        write_hdf5(out, t, a, g, rv)
        with h5py.File(out) as f:
            assert f['synced/time'].shape    == (n,)
            assert f['synced/acce'].shape    == (n, 3)
            assert f['synced/gyro'].shape    == (n, 3)
            assert f['synced/game_rv'].shape == (n, 4)


# ---------------------------------------------------------------------------
# convert (end-to-end)
# ---------------------------------------------------------------------------

class TestConvert:
    def test_end_to_end(self, tmp_path):
        csv = _make_csv(tmp_path, n_rows=25)
        out = tmp_path / "out.hdf5"
        convert(csv, out)
        assert out.exists()
        with h5py.File(out) as f:
            n = len(f['synced/time'])
            assert n > 0
            assert f['synced/acce'].shape    == (n, 3)
            assert f['synced/game_rv'].shape == (n, 4)

    def test_creates_parent_dirs(self, tmp_path):
        csv = _make_csv(tmp_path)
        out = tmp_path / "deep" / "nested" / "out.hdf5"
        convert(csv, out)
        assert out.exists()

    def test_custom_sample_rates(self, tmp_path):
        csv = _make_csv(tmp_path, n_rows=50)
        out = tmp_path / "out.hdf5"
        convert(csv, out, source_hz=50.0, target_hz=100.0)
        with h5py.File(out) as f:
            # 50 frames @ 50 Hz → ~1s → 100 target frames
            n = len(f['synced/time'])
            assert 90 <= n <= 110

    def test_real_himu_file_roundtrip(self, tmp_path):
        p = Path("HIMU-2026-03-25_17-55-25.csv")
        if not p.exists():
            pytest.skip("HIMU sample file not present")
        out = tmp_path / "real.hdf5"
        convert(p, out)
        with h5py.File(out) as f:
            assert np.all(np.isfinite(f['synced/acce'][:]))
            assert np.all(np.isfinite(f['synced/game_rv'][:]))
