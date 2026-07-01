"""Tests for server.agent.context -- context builder for agent system prompt."""

from server.agent.context import build_context


def test_build_context_with_full_state():
    """Context includes bbox, active dataset, and available datasets."""
    client_context = {
        "bbox": [318652, 6397998, 319152, 6398498],
        "activeDataset": "point_cloud",
    }
    available_datasets = ["point_cloud", "buildings", "terrain_raster"]

    result = build_context(client_context, available_datasets)

    assert "318652" in result
    assert "point_cloud" in result
    assert "buildings" in result
    assert "terrain_raster" in result


def test_build_context_with_no_bbox():
    """Context omits bbox line when not provided."""
    client_context = {"bbox": None, "activeDataset": None}
    available_datasets = ["point_cloud"]

    result = build_context(client_context, available_datasets)

    assert "Bounding box" not in result
    assert "point_cloud" in result


def test_build_context_with_empty_context():
    """Context still works with empty client context."""
    result = build_context({}, ["point_cloud"])

    assert "Available datasets" in result
    assert "point_cloud" in result


def test_build_context_with_no_datasets():
    """Context works even if no datasets are available."""
    result = build_context({"bbox": [1, 2, 3, 4]}, [])

    assert "1, 2, 3, 4" in result
    assert "Available datasets" not in result
