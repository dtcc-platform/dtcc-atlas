"""Tests for Claude CLI subprocess runner."""

import json
from unittest.mock import patch, MagicMock

from server.upload.claude_runner import (
    build_quality_prompt,
    build_catalog_review_prompt,
    run_claude_quality_check,
    run_claude_catalog_review,
)


def test_build_quality_prompt_includes_candidates():
    """Verify candidate info (name, type, path, sidecars, CRS) appears in prompt."""
    candidates = [
        {
            "id": "c1",
            "name": "buildings",
            "inferred_type": "vector",
            "primary_rel_path": "buildings.shp",
            "group_rel_paths": ["buildings.shp", "buildings.dbf"],
            "metadata": {"crs": "EPSG:3006"},
        }
    ]
    prompt = build_quality_prompt(
        candidates=candidates,
        batch_root="/data/uploads/raw/abc",
        existing_datasets=[],
    )
    assert "buildings" in prompt
    assert "buildings.shp" in prompt
    assert "EPSG:3006" in prompt
    assert "vector" in prompt


def test_build_quality_prompt_includes_existing_datasets():
    """Verify dataset SHA256 appears in prompt for duplicate detection."""
    prompt = build_quality_prompt(
        candidates=[],
        batch_root="/tmp",
        existing_datasets=[
            {"dataset_name": "roads", "sha256_list": ["aabb"]},
        ],
    )
    assert "roads" in prompt
    assert "aabb" in prompt


def test_run_claude_quality_check_parses_json_output():
    """Mock subprocess.run and verify JSON parsing of quality check result."""
    mock_result = {
        "candidates": [
            {
                "name": "buildings",
                "verdict": "pass",
                "issues": [],
                "metadata": {},
                "summary": "All checks passed.",
            }
        ]
    }
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = json.dumps(mock_result)
    mock_proc.stderr = ""

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is not None
    assert result["candidates"][0]["verdict"] == "pass"


def test_run_claude_quality_check_handles_failure():
    """Mock subprocess failure and verify returns None."""
    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.stdout = ""
    mock_proc.stderr = "Error: no API key"

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is None


def test_run_claude_quality_check_handles_timeout():
    """Verify timeout from subprocess is handled gracefully."""
    import subprocess

    with patch(
        "server.upload.claude_runner.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd="claude", timeout=120),
    ):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is None


def test_run_claude_quality_check_handles_empty_output():
    """Verify empty stdout from subprocess returns None."""
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ""
    mock_proc.stderr = ""

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is None


def test_run_claude_quality_check_unwraps_result_wrapper():
    """Verify claude --output-format json wrapper is unwrapped."""
    inner = {
        "candidates": [
            {
                "name": "terrain",
                "verdict": "warn",
                "issues": [
                    {"severity": "warn", "code": "MISSING_CRS", "message": "No CRS"}
                ],
                "metadata": {},
                "summary": "Missing CRS.",
            }
        ]
    }
    wrapped = {"result": json.dumps(inner), "cost_usd": 0.01}

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = json.dumps(wrapped)
    mock_proc.stderr = ""

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is not None
    assert result["candidates"][0]["verdict"] == "warn"


def test_run_claude_quality_check_extracts_json_from_markdown():
    """Verify JSON extraction from markdown code blocks."""
    inner = {"candidates": [{"name": "data", "verdict": "pass", "issues": []}]}
    markdown_output = f"Here is the result:\n```json\n{json.dumps(inner)}\n```\n"

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = markdown_output
    mock_proc.stderr = ""

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_quality_check(
            candidates=[],
            batch_root="/tmp",
            existing_datasets=[],
        )
    assert result is not None
    assert result["candidates"][0]["verdict"] == "pass"


def test_build_catalog_review_prompt_includes_datasets():
    """Verify dataset info appears in catalog review prompt."""
    datasets = [
        {
            "dataset_name": "buildings-v2",
            "version": 2,
            "inferred_type": "vector",
            "crs": "EPSG:3006",
            "bounds": [11.0, 57.0, 12.0, 58.0],
        }
    ]
    prompt = build_catalog_review_prompt(datasets)
    assert "buildings-v2" in prompt
    assert "v2" in prompt
    assert "vector" in prompt
    assert "EPSG:3006" in prompt
    assert "[11.0, 57.0, 12.0, 58.0]" in prompt


def test_run_claude_catalog_review_parses_json_output():
    """Mock subprocess.run and verify JSON parsing of catalog review."""
    mock_result = {
        "health_score": 85,
        "issues": [],
        "summary": "Catalog is healthy.",
    }
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = json.dumps(mock_result)
    mock_proc.stderr = ""

    with patch("server.upload.claude_runner.subprocess.run", return_value=mock_proc):
        result = run_claude_catalog_review(
            datasets=[
                {
                    "dataset_name": "test",
                    "version": 1,
                    "inferred_type": "vector",
                    "crs": "EPSG:3006",
                    "bounds": [11.0, 57.0, 12.0, 58.0],
                }
            ]
        )
    assert result is not None
    assert result["health_score"] == 85
