"""Tests for vector dataset discovery in server/vector/discovery.py."""

import json

import pytest

from server.vector.discovery import (
    discover_published_datasets,
    get_dataset_metadata,
    get_dataset_geojson_path,
)


# ── discover_published_datasets ──────────────────────────────────────────────


class TestDiscoverPublishedDatasets:
    def test_nonexistent_dir(self, tmp_path):
        result = discover_published_datasets(tmp_path / "nope")
        assert result == []

    def test_empty_dir(self, tmp_path):
        result = discover_published_datasets(tmp_path)
        assert result == []

    def test_reads_datasets_json_index(self, tmp_path):
        index = {
            "datasets": [
                {"name": "ds1", "title": "Dataset 1", "type": "vector"},
            ]
        }
        (tmp_path / "datasets.json").write_text(json.dumps(index), encoding="utf-8")
        result = discover_published_datasets(tmp_path)
        assert len(result) == 1
        assert result[0]["name"] == "ds1"

    def test_falls_back_to_scanning(self, published_dataset_dir):
        result = discover_published_datasets(published_dataset_dir)
        assert len(result) == 1
        assert result[0]["name"] == "test-dataset"
        assert result[0]["type"] == "vector"

    def test_ignores_dirs_without_metadata(self, tmp_path):
        (tmp_path / "no-metadata").mkdir()
        result = discover_published_datasets(tmp_path)
        assert result == []

    def test_ignores_files(self, tmp_path):
        (tmp_path / "some-file.txt").write_text("hello")
        result = discover_published_datasets(tmp_path)
        assert result == []

    def test_malformed_index_json_falls_back(self, tmp_path):
        (tmp_path / "datasets.json").write_text("not valid json")
        # With no valid subdirs, should return []
        result = discover_published_datasets(tmp_path)
        assert result == []

    def test_malformed_metadata_skipped(self, tmp_path):
        ds = tmp_path / "bad-ds"
        ds.mkdir()
        (ds / "metadata.json").write_text("{invalid json")
        result = discover_published_datasets(tmp_path)
        assert result == []

    def test_scanning_uses_subdir_name_as_fallback(self, tmp_path):
        ds = tmp_path / "my-dataset"
        ds.mkdir()
        # metadata.json with no "name" key
        (ds / "metadata.json").write_text(json.dumps({"title": "My DS"}))
        result = discover_published_datasets(tmp_path)
        assert len(result) == 1
        assert result[0]["name"] == "my-dataset"

    def test_scanning_reads_dataset_manifest_v2_package(self, tmp_path):
        ds = tmp_path / "smoke-package"
        ds.mkdir()
        manifest = {
            "schema_version": "dtcc-dataset-manifest-v2",
            "identity": {"name": "smoke", "title": "Smoke Slice"},
            "metadata": {"description": "Synthetic smoke."},
            "provenance": {},
            "presentation": {"summary": "A smoke view."},
            "request": {"dataset_name": "smoke", "bounds": [0, 0, 10, 20]},
            "artifacts": [
                {
                    "path": "artifacts/smoke_slice.png",
                    "role": "primary",
                    "format": "png",
                    "media_type": "image/png",
                    "data_kind": "raster",
                    "bounds": [1, 2, 3, 4],
                }
            ],
        }
        (ds / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

        result = discover_published_datasets(tmp_path)

        assert len(result) == 1
        assert result[0]["name"] == "smoke"
        assert result[0]["title"] == "Smoke Slice"
        assert result[0]["type"] == "dataset_manifest_v2"
        assert result[0]["bounds"] == [1, 2, 3, 4]
        assert result[0]["manifest"] == "manifest.json"
        assert result[0]["display_artifact"]["path"] == "artifacts/smoke_slice.png"
        assert result[0]["artifacts"][0]["media_type"] == "image/png"


# ── get_dataset_metadata ─────────────────────────────────────────────────────


class TestGetDatasetMetadata:
    def test_returns_dict(self, published_dataset_dir):
        meta = get_dataset_metadata("test-dataset", published_dataset_dir)
        assert isinstance(meta, dict)
        assert meta["name"] == "test-dataset"

    def test_missing_returns_none(self, tmp_path):
        assert get_dataset_metadata("nope", tmp_path) is None

    def test_malformed_returns_none(self, tmp_path):
        ds = tmp_path / "bad"
        ds.mkdir()
        (ds / "metadata.json").write_text("not json")
        assert get_dataset_metadata("bad", tmp_path) is None


# ── get_dataset_geojson_path ─────────────────────────────────────────────────


class TestGetDatasetGeojsonPath:
    def test_returns_path(self, published_dataset_dir):
        path = get_dataset_geojson_path("test-dataset", published_dataset_dir)
        assert path is not None
        assert path.name == "data.geojson"

    def test_missing_returns_none(self, tmp_path):
        assert get_dataset_geojson_path("nope", tmp_path) is None
