"""Tests for upload SQLite catalog."""

from pathlib import Path

from server.upload.catalog import UploadCatalog


def test_catalog_batch_and_candidates_roundtrip(tmp_path: Path):
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    batch_id = "batch-1"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="Test Upload",
        root_dir=str(batch_root),
        file_count=2,
        total_bytes=123,
        status="uploaded",
    )

    files = [
        {
            "id": "f1",
            "rel_path": "roads.shp",
            "abs_path": str(batch_root / "roads.shp"),
            "ext": ".shp",
            "size": 100,
            "sha256": "abc",
        },
        {
            "id": "f2",
            "rel_path": "roads.dbf",
            "abs_path": str(batch_root / "roads.dbf"),
            "ext": ".dbf",
            "size": 23,
            "sha256": "def",
        },
    ]
    catalog.add_batch_files(batch_id, files)

    candidates = [
        {
            "id": "c1",
            "candidate_key": "roads",
            "name": "roads",
            "title": "roads",
            "inferred_type": "vector",
            "role": "generic-vector",
            "confidence": "medium",
            "primary_rel_path": "roads.shp",
            "group_rel_paths": ["roads.shp", "roads.dbf"],
            "warnings": [],
            "metadata": {"feature_count": 10},
            "detected_format": "shp",
        }
    ]
    catalog.replace_candidates(batch_id, candidates)
    loaded_candidates = catalog.list_candidates(batch_id)

    assert len(loaded_candidates) == 1
    assert loaded_candidates[0]["name"] == "roads"
    assert loaded_candidates[0]["metadata"]["feature_count"] == 10


def test_catalog_latest_uploaded_dataset_lookup(tmp_path: Path):
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    dataset_name = "my-dataset"

    catalog.insert_uploaded_dataset(
        {
            "id": "d1",
            "dataset_name": dataset_name,
            "title": "My Dataset",
            "version": 1,
            "inferred_type": "vector",
            "role": "generic-vector",
            "source_batch_id": "b1",
            "storage_dir": "/tmp/a",
            "primary_file": "/tmp/a/data.geojson",
            "detected_format": "geojson",
            "crs": "EPSG:3006",
            "bounds": [0, 0, 1, 1],
            "metadata": {"a": 1},
            "status": "active",
        }
    )
    catalog.insert_uploaded_dataset(
        {
            "id": "d2",
            "dataset_name": dataset_name,
            "title": "My Dataset",
            "version": 2,
            "inferred_type": "vector",
            "role": "generic-vector",
            "source_batch_id": "b2",
            "storage_dir": "/tmp/b",
            "primary_file": "/tmp/b/data.geojson",
            "detected_format": "geojson",
            "crs": "EPSG:3006",
            "bounds": [1, 1, 2, 2],
            "metadata": {"b": 2},
            "status": "active",
        }
    )

    latest = catalog.get_uploaded_dataset_by_name(dataset_name)
    assert latest is not None
    assert latest["version"] == 2
    assert latest["metadata"]["b"] == 2
    assert catalog.next_dataset_version(dataset_name) == 3
