"""Tests for preprocess.synthetic_data.validate_avalon_graph."""

from __future__ import annotations

import math

import numpy as np
import pytest

from preprocess.synthetic_data.validate_avalon_graph import (
    BUILDING_ROTATION_DEG,
    IMG_COLS,
    IMG_ROWS,
    DPI,
    _bresenham,
    _build_gps_transform,
    _edge_valid,
    gps_to_pixel,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _minimal_transform(rotation_deg: float = 0.0) -> dict:
    """Return a transform anchored at lon=0, lat=0 → pixel (110, 205)."""
    import preprocess.synthetic_data.validate_avalon_graph as m
    orig = m.BUILDING_ROTATION_DEG
    m.BUILDING_ROTATION_DEG = rotation_deg
    try:
        t = _build_gps_transform([0.0], [0.0])
    finally:
        m.BUILDING_ROTATION_DEG = orig
    return t


# ---------------------------------------------------------------------------
# _build_gps_transform
# ---------------------------------------------------------------------------

class TestBuildGpsTransform:
    def test_anchor_is_centroid_of_inputs(self):
        lons = [-81.155, -81.153]
        lats = [28.509, 28.511]
        t = _build_gps_transform(lons, lats)
        assert t["anchor_lon"] == pytest.approx(-81.154)
        assert t["anchor_lat"] == pytest.approx(28.510)

    def test_anchor_pixel_is_image_centre(self):
        t = _build_gps_transform([0.0, 1.0], [0.0, 1.0])
        assert t["anchor_row"] == pytest.approx((IMG_ROWS - 1) / 2.0)
        assert t["anchor_col"] == pytest.approx((IMG_COLS - 1) / 2.0)

    def test_scale_factors_positive(self):
        t = _build_gps_transform([0.0], [0.0])
        assert t["m_per_deg_lat"] > 0
        assert t["m_per_deg_lon"] > 0

    def test_dpi_stored(self):
        t = _build_gps_transform([0.0], [0.0])
        assert t["dpi"] == DPI

    def test_rotation_stored(self):
        t = _build_gps_transform([0.0], [0.0])
        assert t["rotation_deg"] == pytest.approx(BUILDING_ROTATION_DEG)


# ---------------------------------------------------------------------------
# gps_to_pixel
# ---------------------------------------------------------------------------

class TestGpsToPixel:
    def test_anchor_maps_to_anchor_pixel(self):
        t = _build_gps_transform([-81.154, -81.153], [28.509, 28.511])
        row, col = gps_to_pixel(t["anchor_lon"], t["anchor_lat"], t)
        assert row == pytest.approx(t["anchor_row"], abs=1e-6)
        assert col == pytest.approx(t["anchor_col"], abs=1e-6)

    def test_north_displacement_increases_col(self):
        # Moving north (+lat) should increase col (right in image).
        t = _build_gps_transform([0.0], [0.0])
        _, col_at_anchor = gps_to_pixel(0.0, 0.0, t)
        _, col_north = gps_to_pixel(0.0, 0.001, t)
        assert col_north > col_at_anchor

    def test_east_displacement_increases_row(self):
        # Moving east (+lon) should increase row (down in image).
        t = _build_gps_transform([0.0], [0.0])
        row_at_anchor, _ = gps_to_pixel(0.0, 0.0, t)
        row_east, _ = gps_to_pixel(0.001, 0.0, t)
        assert row_east > row_at_anchor

    def test_scale_matches_dpi(self):
        # A 1-metre northward step should shift col by exactly DPI pixels
        # (at zero rotation, cos_t=1, sin_t=0, so d_col_m = d_N).
        import preprocess.synthetic_data.validate_avalon_graph as m
        orig = m.BUILDING_ROTATION_DEG
        m.BUILDING_ROTATION_DEG = 0.0
        try:
            t = _build_gps_transform([0.0], [0.0])
        finally:
            m.BUILDING_ROTATION_DEG = orig
        deg_per_metre_lat = 1.0 / t["m_per_deg_lat"]
        _, col0 = gps_to_pixel(0.0, 0.0, t)
        _, col1 = gps_to_pixel(0.0, deg_per_metre_lat, t)
        assert col1 - col0 == pytest.approx(DPI, abs=0.01)

    def test_rotation_rotates_displacement(self):
        # At 90° rotation the building long axis points east, so a northward
        # step should shift row rather than col.
        import preprocess.synthetic_data.validate_avalon_graph as m
        orig = m.BUILDING_ROTATION_DEG
        m.BUILDING_ROTATION_DEG = 90.0
        try:
            t = _build_gps_transform([0.0], [0.0])
        finally:
            m.BUILDING_ROTATION_DEG = orig
        row0, col0 = gps_to_pixel(0.0, 0.0, t)
        row1, col1 = gps_to_pixel(0.0, 0.001, t)
        # col should barely change, row should decrease (north → up at 90°)
        assert abs(col1 - col0) < abs(row1 - row0)


# ---------------------------------------------------------------------------
# _bresenham
# ---------------------------------------------------------------------------

class TestBresenham:
    def test_single_point(self):
        cells = _bresenham(5, 5, 5, 5)
        assert cells == [(5, 5)]

    def test_horizontal_line(self):
        cells = _bresenham(3, 0, 3, 4)
        assert cells == [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4)]

    def test_vertical_line(self):
        cells = _bresenham(0, 2, 3, 2)
        assert cells == [(0, 2), (1, 2), (2, 2), (3, 2)]

    def test_diagonal_line(self):
        cells = _bresenham(0, 0, 2, 2)
        assert cells[0] == (0, 0)
        assert cells[-1] == (2, 2)
        assert len(cells) == 3

    def test_endpoints_always_included(self):
        for r0, c0, r1, c1 in [(0, 0, 5, 3), (10, 2, 1, 8), (0, 0, 0, 10)]:
            cells = _bresenham(r0, c0, r1, c1)
            assert cells[0] == (r0, c0)
            assert cells[-1] == (r1, c1)

    def test_reverse_contains_same_endpoints(self):
        # Bresenham may visit different interior pixels depending on direction
        # (this is a known property of the algorithm), but endpoints are always
        # included regardless of traversal direction.
        fwd = _bresenham(0, 0, 4, 3)
        rev = _bresenham(4, 3, 0, 0)
        assert (0, 0) in set(fwd) and (4, 3) in set(fwd)
        assert (0, 0) in set(rev) and (4, 3) in set(rev)


# ---------------------------------------------------------------------------
# _edge_valid
# ---------------------------------------------------------------------------

class TestEdgeValid:
    def _all_walkable(self) -> np.ndarray:
        return np.ones((IMG_ROWS, IMG_COLS), dtype=bool)

    def _wall_at_col(self, col: int) -> np.ndarray:
        mask = np.ones((IMG_ROWS, IMG_COLS), dtype=bool)
        mask[:, col] = False
        return mask

    def test_valid_on_fully_walkable_mask(self):
        mask = self._all_walkable()
        assert _edge_valid(10, 10, 10, 50, mask) is True

    def test_invalid_when_crosses_wall(self):
        mask = self._wall_at_col(30)
        assert _edge_valid(10, 10, 10, 50, mask) is False

    def test_invalid_when_endpoint_outside_bounds(self):
        mask = self._all_walkable()
        assert _edge_valid(0, 0, 0, IMG_COLS + 10, mask) is False
        assert _edge_valid(0, 0, IMG_ROWS + 10, 0, mask) is False

    def test_valid_edge_touching_wall_column_endpoint(self):
        # Edge that ends exactly at a wall pixel is invalid.
        mask = self._wall_at_col(50)
        assert _edge_valid(10, 10, 10, 50, mask) is False

    def test_zero_length_edge_on_walkable(self):
        mask = self._all_walkable()
        assert _edge_valid(5, 5, 5, 5, mask) is True

    def test_zero_length_edge_on_wall(self):
        mask = self._all_walkable()
        mask[5, 5] = False
        assert _edge_valid(5, 5, 5, 5, mask) is False
