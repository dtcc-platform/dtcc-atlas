"""Tests for the quality gate orchestrator."""

import json
from pathlib import Path
from unittest.mock import patch

from server.upload.catalog import UploadCatalog
from server.upload.quality_gate import _collect_existing_datasets, run_quality_gate


def _setup_batch(tmp_path: Path) -> tuple[UploadCatalog, str]:
    """Create a catalog with one batch containing one candidate and batch files.

    Returns (catalog, batch_id).
    """
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    batch_id = "batch-qg"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="QG Test Batch",
        root_dir=str(batch_root),
        file_count=1,
        total_bytes=500,
        status="uploaded",
    )

    files = [
        {
            "id": "f1",
            "rel_path": "buildings.geojson",
            "abs_path": str(batch_root / "buildings.geojson"),
            "ext": ".geojson",
            "size": 500,
            "sha256": "aabbccdd",
        }
    ]
    catalog.add_batch_files(batch_id, files)

    candidates = [
        {
            "id": "cand-1",
            "candidate_key": "buildings",
            "name": "buildings",
            "title": "Buildings",
            "inferred_type": "vector",
            "role": "building",
            "confidence": "high",
            "primary_rel_path": "buildings.geojson",
            "group_rel_paths": ["buildings.geojson"],
            "warnings": [],
            "metadata": {"crs": "EPSG:3006"},
            "detected_format": "geojson",
        }
    ]
    catalog.replace_candidates(batch_id, candidates)

    return catalog, batch_id


def test_run_quality_gate_stores_verdicts(tmp_path: Path):
    """Mock Claude result, verify merged verdicts are persisted in catalog."""
    catalog, batch_id = _setup_batch(tmp_path)

    mock_claude_result = {
        "candidates": [
            {
                "name": "buildings",
                "verdict": "warn",
                "issues": [
                    {
                        "severity": "warn",
                        "code": "MISSING_CRS",
                        "message": "No CRS detected",
                    }
                ],
                "metadata": {"crs": None, "bounds": [11, 57, 12, 58]},
                "thumbnail_path": "/tmp/thumb.png",
                "summary": "CRS is missing from dataset.",
            }
        ]
    }

    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=mock_claude_result,
    ):
        result = run_quality_gate(catalog, batch_id)

    # Should return merged result (deterministic + AI)
    assert result is not None
    merged = result["candidates"][0]
    # AI issue MISSING_CRS also detected by deterministic — only appears once
    issue_codes = [i["code"] for i in merged["issues"]]
    assert "MISSING_CRS" in issue_codes

    # Batch quality check status should be "completed"
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "completed"

    # Candidate verdict should be persisted with AI thumbnail
    candidates = catalog.list_candidates(batch_id)
    assert len(candidates) == 1
    assert candidates[0]["verdict"] in ("warn", "pass")
    assert candidates[0]["thumbnail_path"] == "/tmp/thumb.png"
    # Deterministic summary stored in verdict_summary
    assert candidates[0]["verdict_summary"] is not None
    # AI summary available in the result JSON
    assert merged.get("ai_summary") == "CRS is missing from dataset."


def test_run_quality_gate_handles_claude_failure(tmp_path: Path):
    """Mock None from Claude — deterministic verdicts should still be returned."""
    catalog, batch_id = _setup_batch(tmp_path)

    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=None,
    ):
        result = run_quality_gate(catalog, batch_id)

    # Should return deterministic results even without AI
    assert result is not None
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["name"] == "buildings"

    # Batch quality check status should be "completed" (deterministic succeeded)
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "completed"


def test_collect_existing_datasets(tmp_path: Path):
    """Verify _collect_existing_datasets gathers SHA256 hashes from batch files."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    # Create a batch for the dataset's source
    batch_id = "batch-src"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="Source Batch",
        root_dir=str(batch_root),
        file_count=2,
        total_bytes=200,
    )

    files = [
        {
            "id": "f1",
            "rel_path": "a.shp",
            "abs_path": str(batch_root / "a.shp"),
            "ext": ".shp",
            "size": 100,
            "sha256": "hash1",
        },
        {
            "id": "f2",
            "rel_path": "a.dbf",
            "abs_path": str(batch_root / "a.dbf"),
            "ext": ".dbf",
            "size": 100,
            "sha256": "hash2",
        },
    ]
    catalog.add_batch_files(batch_id, files)

    # Insert an uploaded dataset referencing that batch
    catalog.insert_uploaded_dataset(
        {
            "id": "ds-1",
            "dataset_name": "roads",
            "title": "Roads",
            "version": 1,
            "inferred_type": "vector",
            "role": "generic-vector",
            "source_batch_id": batch_id,
            "storage_dir": "/tmp/ds",
            "primary_file": "/tmp/ds/roads.geojson",
            "detected_format": "geojson",
            "crs": "EPSG:3006",
            "bounds": [0, 0, 1, 1],
            "metadata": {},
            "status": "active",
        }
    )

    result = _collect_existing_datasets(catalog)
    assert len(result) == 1
    assert result[0]["dataset_name"] == "roads"
    assert sorted(result[0]["sha256_list"]) == ["hash1", "hash2"]
