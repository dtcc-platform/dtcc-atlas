"""Tests for upload ingestion helpers."""

from pathlib import Path

from server.upload.ingest import detect_media_type, _resolve_dataset_name


def test_detect_media_type_cityjson_zip(tmp_path: Path):
    path = tmp_path / "model.json.zip"
    path.write_bytes(b"dummy")
    assert detect_media_type(path) == "application/zip"


def test_resolve_dataset_name_reserved():
    resolved, warning = _resolve_dataset_name("buildings", {"buildings", "buildings-uploaded"})
    assert resolved == "buildings-uploaded-2"
    assert warning is not None
    assert "renamed" in warning

