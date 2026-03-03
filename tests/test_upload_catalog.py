"""Tests for upload SQLite catalog."""

import json
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


def test_catalog_quality_check_columns(tmp_path: Path):
    """Test quality-check columns: batch quality_check, candidate verdict, dataset review."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    # --- 1. Batch quality_check_status / quality_check_result round-trip ---
    batch_id = "batch-qc"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="QC Test Batch",
        root_dir=str(batch_root),
        file_count=1,
        total_bytes=50,
    )

    # Initially both quality check fields should be None
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] is None
    assert batch["quality_check_result"] is None

    qc_result = {"passed": 2, "failed": 1, "issues": ["missing CRS"]}
    catalog.update_quality_check(batch_id, status="completed", result=qc_result)

    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "completed"
    # Result is stored as JSON TEXT; verify round-trip
    assert json.loads(batch["quality_check_result"]) == qc_result

    # --- 2. Candidate verdict fields round-trip ---
    candidates = [
        {
            "id": "cand-v1",
            "candidate_key": "buildings",
            "name": "buildings",
            "title": "Buildings layer",
            "inferred_type": "vector",
            "role": "building",
            "confidence": "high",
            "primary_rel_path": "buildings.geojson",
            "group_rel_paths": ["buildings.geojson"],
            "warnings": [],
            "metadata": {},
            "detected_format": "geojson",
        }
    ]
    catalog.replace_candidates(batch_id, candidates)

    # Initially verdict fields should be None
    loaded = catalog.list_candidates(batch_id)
    assert len(loaded) == 1
    assert loaded[0]["verdict"] is None
    assert loaded[0]["verdict_issues"] is None
    assert loaded[0]["verdict_summary"] is None
    assert loaded[0]["thumbnail_path"] is None

    verdict_issues = [{"severity": "error", "message": "No CRS detected"}]
    catalog.update_candidate_verdict(
        candidate_id="cand-v1",
        verdict="fail",
        issues=verdict_issues,
        summary="Missing CRS",
        thumbnail_path="/tmp/thumb.png",
    )

    loaded = catalog.list_candidates(batch_id)
    assert loaded[0]["verdict"] == "fail"
    # verdict_issues should be decoded from JSON string to list by _decode_candidate
    assert loaded[0]["verdict_issues"] == verdict_issues
    assert loaded[0]["verdict_summary"] == "Missing CRS"
    assert loaded[0]["thumbnail_path"] == "/tmp/thumb.png"

    # --- 3. Dataset review round-trip ---
    catalog.create_batch(
        batch_id="batch-ds",
        name="DS batch",
        root_dir=str(batch_root),
        file_count=0,
        total_bytes=0,
    )
    catalog.insert_uploaded_dataset(
        {
            "id": "ds-rev1",
            "dataset_name": "review-test",
            "title": "Review Test",
            "version": 1,
            "inferred_type": "vector",
            "role": "generic-vector",
            "source_batch_id": "batch-ds",
            "storage_dir": "/tmp/ds",
            "primary_file": "/tmp/ds/data.geojson",
            "detected_format": "geojson",
            "crs": "EPSG:3006",
            "bounds": [0, 0, 1, 1],
            "metadata": {},
            "status": "active",
        }
    )

    ds = catalog.get_uploaded_dataset_by_name("review-test")
    assert ds["last_review_at"] is None
    assert ds["review_issues"] is None

    review_issues = [{"severity": "warning", "message": "Low feature count"}]
    catalog.update_dataset_review("ds-rev1", review_issues=review_issues)

    ds = catalog.get_uploaded_dataset_by_name("review-test")
    assert ds["last_review_at"] is not None  # should be an ISO timestamp
    assert json.loads(ds["review_issues"]) == review_issues
