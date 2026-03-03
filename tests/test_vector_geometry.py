"""Tests for vector geometry utility functions in server/vector/routes.py."""

import pytest

from server.vector.routes import (
    bbox_intersects,
    get_geometry_bbox,
    _extract_coords,
    clip_features_to_bounds,
)


# ── bbox_intersects ──────────────────────────────────────────────────────────


class TestBboxIntersects:
    def test_overlapping(self):
        assert bbox_intersects([0, 0, 2, 2], [1, 1, 3, 3]) is True

    def test_non_overlapping_horizontal(self):
        assert bbox_intersects([0, 0, 1, 1], [2, 0, 3, 1]) is False

    def test_non_overlapping_vertical(self):
        assert bbox_intersects([0, 0, 1, 1], [0, 2, 1, 3]) is False

    def test_touching_edges(self):
        # Touching at edge (feature maxX == query minX) → not separated
        assert bbox_intersects([0, 0, 1, 1], [1, 0, 2, 1]) is True

    def test_containment(self):
        assert bbox_intersects([0, 0, 10, 10], [2, 2, 5, 5]) is True

    def test_identical(self):
        assert bbox_intersects([1, 2, 3, 4], [1, 2, 3, 4]) is True

    def test_degenerate_point_bbox(self):
        # Both bboxes collapse to a single point
        assert bbox_intersects([5, 5, 5, 5], [5, 5, 5, 5]) is True

    def test_degenerate_point_bbox_miss(self):
        assert bbox_intersects([5, 5, 5, 5], [6, 6, 6, 6]) is False


# ── _extract_coords ──────────────────────────────────────────────────────────


class TestExtractCoords:
    def test_point(self):
        geom = {"type": "Point", "coordinates": [1.0, 2.0]}
        assert _extract_coords(geom) == [[1.0, 2.0]]

    def test_linestring(self):
        geom = {"type": "LineString", "coordinates": [[0, 0], [1, 1], [2, 2]]}
        assert _extract_coords(geom) == [[0, 0], [1, 1], [2, 2]]

    def test_polygon(self):
        ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
        geom = {"type": "Polygon", "coordinates": [ring]}
        assert _extract_coords(geom) == ring

    def test_multipoint(self):
        geom = {"type": "MultiPoint", "coordinates": [[0, 0], [1, 1]]}
        assert _extract_coords(geom) == [[0, 0], [1, 1]]

    def test_multilinestring(self):
        geom = {
            "type": "MultiLineString",
            "coordinates": [[[0, 0], [1, 1]], [[2, 2], [3, 3]]],
        }
        assert _extract_coords(geom) == [[0, 0], [1, 1], [2, 2], [3, 3]]

    def test_multipolygon(self):
        ring1 = [[0, 0], [1, 0], [1, 1], [0, 0]]
        ring2 = [[2, 2], [3, 2], [3, 3], [2, 2]]
        geom = {"type": "MultiPolygon", "coordinates": [[ring1], [ring2]]}
        assert _extract_coords(geom) == ring1 + ring2

    def test_geometry_collection(self):
        geom = {
            "type": "GeometryCollection",
            "geometries": [
                {"type": "Point", "coordinates": [1, 2]},
                {"type": "Point", "coordinates": [3, 4]},
            ],
        }
        assert _extract_coords(geom) == [[1, 2], [3, 4]]

    def test_empty_point(self):
        geom = {"type": "Point", "coordinates": []}
        assert _extract_coords(geom) == []

    def test_unknown_type(self):
        geom = {"type": "FooBar", "coordinates": [[1, 2]]}
        assert _extract_coords(geom) == []

    def test_missing_type(self):
        geom = {"coordinates": [[1, 2]]}
        assert _extract_coords(geom) == []


# ── get_geometry_bbox ────────────────────────────────────────────────────────


class TestGetGeometryBbox:
    def test_point(self):
        geom = {"type": "Point", "coordinates": [5.0, 10.0]}
        assert get_geometry_bbox(geom) == [5.0, 10.0, 5.0, 10.0]

    def test_polygon_covers_ring(self):
        ring = [[1, 2], [3, 2], [3, 4], [1, 4], [1, 2]]
        geom = {"type": "Polygon", "coordinates": [ring]}
        assert get_geometry_bbox(geom) == [1, 2, 3, 4]

    def test_empty_returns_none(self):
        geom = {"type": "Point", "coordinates": []}
        assert get_geometry_bbox(geom) is None


# ── clip_features_to_bounds ──────────────────────────────────────────────────


class TestClipFeaturesToBounds:
    def test_inside_kept(self, sample_point_feature):
        fc = {"type": "FeatureCollection", "features": [sample_point_feature]}
        # Point at [11.97, 57.71] is inside [11, 57, 12, 58]
        result = clip_features_to_bounds(fc, [11, 57, 12, 58])
        assert len(result["features"]) == 1

    def test_outside_excluded(self, sample_point_feature):
        fc = {"type": "FeatureCollection", "features": [sample_point_feature]}
        # Point at [11.97, 57.71] is outside [0, 0, 1, 1]
        result = clip_features_to_bounds(fc, [0, 0, 1, 1])
        assert len(result["features"]) == 0

    def test_overlap_kept(self, sample_polygon_feature):
        fc = {"type": "FeatureCollection", "features": [sample_polygon_feature]}
        # Polygon covers [11,57]-[12,58], query overlaps at [11.5,57.5,13,59]
        result = clip_features_to_bounds(fc, [11.5, 57.5, 13, 59])
        assert len(result["features"]) == 1

    def test_empty_collection(self):
        fc = {"type": "FeatureCollection", "features": []}
        result = clip_features_to_bounds(fc, [0, 0, 1, 1])
        assert result["features"] == []
        assert result["type"] == "FeatureCollection"

    def test_no_geometry_skipped(self):
        feature = {"type": "Feature", "geometry": None, "properties": {}}
        fc = {"type": "FeatureCollection", "features": [feature]}
        result = clip_features_to_bounds(fc, [0, 0, 100, 100])
        assert len(result["features"]) == 0

    def test_output_structure(self, sample_point_feature):
        fc = {"type": "FeatureCollection", "features": [sample_point_feature]}
        bounds = [11, 57, 12, 58]
        result = clip_features_to_bounds(fc, bounds)
        assert result["type"] == "FeatureCollection"
        assert result["bbox"] == bounds
        assert "features" in result
