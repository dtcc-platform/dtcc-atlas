"""Tests for the catalog review orchestrator."""

from pathlib import Path
from unittest.mock import patch

from server.upload.catalog import UploadCatalog
from server.upload.catalog_review import run_catalog_review


def _insert_dataset(catalog: UploadCatalog, tmp_path: Path) -> str:
    """Insert a batch + dataset into the catalog and return the dataset id."""
    batch_id = "batch-cr"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="CR Test Batch",
        root_dir=str(batch_root),
        file_count=1,
        total_bytes=400,
        status="ingested",
    )

    catalog.insert_uploaded_dataset(
        {
            "id": "ds-cr-1",
            "dataset_name": "terrain",
            "title": "Terrain",
            "version": 1,
            "inferred_type": "raster",
            "role": "terrain",
            "source_batch_id": batch_id,
            "storage_dir": str(tmp_path / "datasets" / "terrain"),
            "primary_file": str(tmp_path / "datasets" / "terrain" / "terrain.tif"),
            "detected_format": "tif",
            "crs": "EPSG:3006",
            "bounds": [11, 57, 12, 58],
            "metadata": {},
            "status": "active",
        }
    )
    return "ds-cr-1"


def test_run_catalog_review_returns_report(tmp_path: Path):
    """Insert a dataset, mock Claude result, verify return value."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)
    dataset_id = _insert_dataset(catalog, tmp_path)

    mock_result = {
        "health_score": 85,
        "issues": [
            {
                "code": "COVERAGE_GAP",
                "severity": "warn",
                "datasets": ["terrain"],
                "message": "No building data found alongside terrain.",
            }
        ],
        "summary": "Catalog has minor coverage gaps.",
    }

    with patch(
        "server.upload.catalog_review.run_claude_catalog_review",
        return_value=mock_result,
    ):
        result = run_catalog_review(catalog)

    assert result is not None
    assert result["health_score"] == 85
    assert len(result["issues"]) == 1
    assert result["issues"][0]["code"] == "COVERAGE_GAP"
    assert result["summary"] == "Catalog has minor coverage gaps."


def test_run_catalog_review_handles_failure(tmp_path: Path):
    """Mock Claude returning None, verify returns None."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)
    _insert_dataset(catalog, tmp_path)

    with patch(
        "server.upload.catalog_review.run_claude_catalog_review",
        return_value=None,
    ):
        result = run_catalog_review(catalog)

    assert result is None
