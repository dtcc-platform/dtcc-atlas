"""Tests for upload ingestion helpers."""

from pathlib import Path

import pytest

from server.upload.ingest import detect_media_type, _resolve_dataset_name
from server.upload.routes import _compute_combined_bounds


def test_detect_media_type_cityjson_zip(tmp_path: Path):
    path = tmp_path / "model.json.zip"
    path.write_bytes(b"dummy")
    assert detect_media_type(path) == "application/zip"


def test_resolve_dataset_name_reserved():
    resolved, warning = _resolve_dataset_name("buildings", {"buildings", "buildings-uploaded"})
    assert resolved == "buildings-uploaded-2"
    assert warning is not None
    assert "renamed" in warning


# ---------------------------------------------------------------------------
# _compute_combined_bounds tests
# ---------------------------------------------------------------------------


def test_combined_bounds_single_epsg3006():
    """A single dataset already in EPSG:3006 returns its bounds unchanged."""
    items = [
        {"bounds": [319000.0, 6400000.0, 320000.0, 6401000.0], "crs": "EPSG:3006"},
    ]
    result = _compute_combined_bounds(items)
    assert result is not None
    assert result["crs"] == "EPSG:3006"
    assert result["minX"] == pytest.approx(319000.0)
    assert result["minY"] == pytest.approx(6400000.0)
    assert result["maxX"] == pytest.approx(320000.0)
    assert result["maxY"] == pytest.approx(6401000.0)


def test_combined_bounds_union_two_datasets():
    """Union of two overlapping EPSG:3006 datasets produces the enclosing box."""
    items = [
        {"bounds": [319000.0, 6400000.0, 320000.0, 6401000.0], "crs": "EPSG:3006"},
        {"bounds": [319500.0, 6400500.0, 321000.0, 6402000.0], "crs": "EPSG:3006"},
    ]
    result = _compute_combined_bounds(items)
    assert result is not None
    assert result["crs"] == "EPSG:3006"
    assert result["minX"] == pytest.approx(319000.0)
    assert result["minY"] == pytest.approx(6400000.0)
    assert result["maxX"] == pytest.approx(321000.0)
    assert result["maxY"] == pytest.approx(6402000.0)


def test_combined_bounds_no_bounds():
    """Datasets with None bounds return None overall."""
    items = [
        {"bounds": None, "crs": None},
        {"bounds": None, "crs": "EPSG:3006"},
    ]
    result = _compute_combined_bounds(items)
    assert result is None


def test_combined_bounds_mixed_crs():
    """WGS84 bounds get reprojected to EPSG:3006 before computing the union."""
    from pyproj import Transformer

    # Convert known WGS84 corners to EPSG:3006 for expected values
    t = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    x_min, y_min = t.transform(11.97, 57.71)
    x_max, y_max = t.transform(12.0, 57.72)

    items = [
        {"bounds": [11.97, 57.71, 12.0, 57.72], "crs": "EPSG:4326"},
    ]
    result = _compute_combined_bounds(items)
    assert result is not None
    assert result["crs"] == "EPSG:3006"
    assert result["minX"] == pytest.approx(x_min, rel=1e-3)
    assert result["minY"] == pytest.approx(y_min, rel=1e-3)
    assert result["maxX"] == pytest.approx(x_max, rel=1e-3)
    assert result["maxY"] == pytest.approx(y_max, rel=1e-3)

