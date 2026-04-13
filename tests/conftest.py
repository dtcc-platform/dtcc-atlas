"""Shared test fixtures and dtcc_core mocking."""

import sys
import json
from pathlib import Path
from unittest.mock import MagicMock

# Mock dtcc_core and related modules BEFORE any server imports.
# server/main.py runs `from dtcc_core import datasets` and `datasets.list()`
# at module level, so these must be in sys.modules first.
_mock = MagicMock(name="dtcc_core")
_mock.datasets.list.return_value = {}
sys.modules["dtcc_core"] = _mock
sys.modules["dtcc_core.datasets"] = _mock.datasets
sys.modules["dtcc_core.datasets.dataset"] = MagicMock()
sys.modules["dtcc_core.common"] = MagicMock()
sys.modules["dtcc_core.common.progress"] = MagicMock()
sys.modules["dtcc_lod2_roofer"] = MagicMock()
sys.modules["pyproj"] = MagicMock()
sys.modules["requests"] = MagicMock()
multipart_mock = MagicMock()
multipart_mock.__version__ = "0.0"
sys.modules["multipart"] = multipart_mock
sys.modules["multipart.multipart"] = MagicMock(parse_options_header=lambda *args, **kwargs: {})

import pytest


@pytest.fixture
def sample_point_feature():
    """A GeoJSON Feature with a Point geometry."""
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [11.97, 57.71]},
        "properties": {"name": "Gothenburg"},
    }


@pytest.fixture
def sample_polygon_feature():
    """A GeoJSON Feature with a Polygon geometry."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [11.0, 57.0],
                    [12.0, 57.0],
                    [12.0, 58.0],
                    [11.0, 58.0],
                    [11.0, 57.0],
                ]
            ],
        },
        "properties": {"name": "Region"},
    }


@pytest.fixture
def sample_feature_collection(sample_point_feature, sample_polygon_feature):
    """A GeoJSON FeatureCollection with two features."""
    return {
        "type": "FeatureCollection",
        "features": [sample_point_feature, sample_polygon_feature],
    }


@pytest.fixture
def published_dataset_dir(tmp_path):
    """
    Create a temporary published dataset directory structure:
      tmp_path/
        test-dataset/
          metadata.json
          data.geojson
    """
    ds_dir = tmp_path / "test-dataset"
    ds_dir.mkdir()

    metadata = {
        "name": "test-dataset",
        "title": "Test Dataset",
        "source": "test",
        "schema": {"type": "object", "properties": {"name": {"type": "string"}}},
    }
    (ds_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")

    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [11.97, 57.71]},
                "properties": {"name": "A"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [15.0, 60.0]},
                "properties": {"name": "B"},
            },
        ],
    }
    (ds_dir / "data.geojson").write_text(json.dumps(geojson), encoding="utf-8")

    return tmp_path
