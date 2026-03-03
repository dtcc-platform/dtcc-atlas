# Agentic Quality Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-powered quality gate that inspects upload candidates before ingestion, and an on-demand catalog health reviewer — both backed by Claude CLI spawning dtcc-agent MCP tools.

**Architecture:** Atlas backend spawns `claude -p` as a subprocess with `--mcp-config` pointing to dtcc-agent. Structured prompts produce JSON verdicts. Results stream to the frontend via SSE. Two features share the same subprocess + SSE pattern: per-candidate quality checks and catalog-wide health reviews.

**Tech Stack:** Python (FastAPI, asyncio, subprocess), TypeScript/Svelte 5, Claude CLI (`claude -p`), dtcc-agent MCP server, SQLite.

---

## Task 1: Add quality-check columns to catalog schema

**Files:**
- Modify: `server/upload/catalog.py:31-109` (schema init)
- Test: `tests/test_upload_catalog.py`

**Step 1: Write the failing test**

Add to `tests/test_upload_catalog.py`:

```python
def test_catalog_quality_check_columns(tmp_path: Path):
    """Verify quality-check columns exist on batches and candidates."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    batch_id = "qc-batch"
    catalog.create_batch(
        batch_id=batch_id,
        name="QC Test",
        root_dir=str(tmp_path),
        file_count=0,
        total_bytes=0,
    )

    # Update quality check status on batch
    catalog.update_quality_check(batch_id, status="completed", result={"candidates": []})
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "completed"
    assert batch["quality_check_result"] is not None

    # Add candidate with verdict columns
    candidates = [
        {
            "id": "c1",
            "candidate_key": "test",
            "name": "test",
            "title": "test",
            "inferred_type": "vector",
            "role": "generic-vector",
            "confidence": "medium",
            "primary_rel_path": "test.shp",
            "group_rel_paths": ["test.shp"],
            "warnings": [],
            "metadata": {},
            "detected_format": "shp",
        }
    ]
    catalog.replace_candidates(batch_id, candidates)

    catalog.update_candidate_verdict(
        candidate_id="c1",
        verdict="warn",
        issues=[{"severity": "warn", "code": "MISSING_CRS", "message": "No CRS"}],
        summary="Missing CRS detected.",
        thumbnail_path="/tmp/thumb.png",
    )

    loaded = catalog.list_candidates(batch_id)
    assert loaded[0]["verdict"] == "warn"
    assert loaded[0]["verdict_summary"] == "Missing CRS detected."
    assert loaded[0]["thumbnail_path"] == "/tmp/thumb.png"
    assert len(loaded[0]["verdict_issues"]) == 1
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_upload_catalog.py::test_catalog_quality_check_columns -v`
Expected: FAIL — `update_quality_check` and `update_candidate_verdict` don't exist.

**Step 3: Write minimal implementation**

In `server/upload/catalog.py`, add new columns to `_init_schema` migration block (after existing `CREATE TABLE` statements, in the backward-compat migration section around line 95-109):

```python
# -- Quality gate columns (added v2) --
_migrations = [
    ("upload_batches", "quality_check_status", "TEXT"),
    ("upload_batches", "quality_check_result", "TEXT"),
    ("upload_candidates", "verdict", "TEXT"),
    ("upload_candidates", "verdict_issues", "TEXT"),
    ("upload_candidates", "verdict_summary", "TEXT"),
    ("upload_candidates", "thumbnail_path", "TEXT"),
    ("uploaded_datasets", "last_review_at", "TEXT"),
    ("uploaded_datasets", "review_issues", "TEXT"),
]
for table, col, col_type in _migrations:
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
    except sqlite3.OperationalError:
        pass  # column already exists
```

Add two new methods:

```python
def update_quality_check(
    self, batch_id: str, status: str, result: dict[str, Any] | None = None
) -> None:
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE upload_batches SET quality_check_status = ?, quality_check_result = ? WHERE id = ?",
            (status, json.dumps(result) if result else None, batch_id),
        )

def update_candidate_verdict(
    self,
    candidate_id: str,
    verdict: str,
    issues: list[dict[str, Any]],
    summary: str,
    thumbnail_path: str | None = None,
) -> None:
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE upload_candidates SET verdict = ?, verdict_issues = ?, verdict_summary = ?, thumbnail_path = ? WHERE id = ?",
            (verdict, json.dumps(issues), summary, thumbnail_path, candidate_id),
        )
```

Update `_decode_candidate` to handle the new JSON field:

```python
@staticmethod
def _decode_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    candidate["group_rel_paths"] = json.loads(candidate["group_rel_paths_json"])
    candidate["warnings"] = json.loads(candidate["warnings_json"])
    candidate["metadata"] = json.loads(candidate["metadata_json"])
    candidate.pop("group_rel_paths_json", None)
    candidate.pop("warnings_json", None)
    candidate.pop("metadata_json", None)
    # Decode verdict issues if present
    raw_issues = candidate.get("verdict_issues")
    if isinstance(raw_issues, str):
        candidate["verdict_issues"] = json.loads(raw_issues)
    # Decode quality_check_result if present on batch joins
    raw_qc = candidate.get("quality_check_result")
    if isinstance(raw_qc, str):
        candidate["quality_check_result"] = json.loads(raw_qc)
    return candidate
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_upload_catalog.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/upload/catalog.py tests/test_upload_catalog.py
git commit -m "feat: add quality-check columns to upload catalog schema"
```

---

## Task 2: Create the Claude CLI subprocess wrapper

**Files:**
- Create: `server/upload/claude_runner.py`
- Test: `tests/test_claude_runner.py`

**Step 1: Write the failing test**

Create `tests/test_claude_runner.py`:

```python
"""Tests for Claude CLI subprocess runner."""

import json
from unittest.mock import patch, MagicMock
from server.upload.claude_runner import run_claude_quality_check, build_quality_prompt


def test_build_quality_prompt_includes_candidates():
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
    assert result["candidates"][0]["verdict"] == "pass"


def test_run_claude_quality_check_handles_failure():
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
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_claude_runner.py -v`
Expected: FAIL — module `server.upload.claude_runner` does not exist.

**Step 3: Write minimal implementation**

Create `server/upload/claude_runner.py`:

```python
"""Spawn Claude CLI to run quality checks via dtcc-agent MCP tools."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from server.config import BASE_DIR

logger = logging.getLogger(__name__)

# MCP config path — points claude -p to the dtcc-agent MCP server
MCP_CONFIG_PATH = BASE_DIR / ".mcp.json"

# Timeout for claude subprocess (seconds)
CLAUDE_TIMEOUT = 120

QUALITY_SYSTEM_PROMPT = """\
You are a geospatial data quality inspector for the DTCC Atlas platform.
You have access to dtcc-agent MCP tools for loading and inspecting geospatial files.

When inspecting files, use these dtcc-agent tools:
1. run_operation with io.load_* operations to load files
2. inspect_object to examine CRS, bounds, feature counts, metadata
3. spatial_query to check bounds validity
4. render_object to generate thumbnails

Return ONLY valid JSON matching the requested output format. No markdown, no explanation outside the JSON."""

QUALITY_PROMPT_TEMPLATE = """\
Inspect the following upload candidates and return a quality verdict for each.

## Candidates
{candidates_block}

## Existing catalog datasets (for duplicate detection)
{existing_block}

## Batch root directory
{batch_root}

## Instructions
For each candidate:
1. Try to load the file using the appropriate io operation (e.g., io.load_pointcloud, io.load_vector, io.load_raster)
2. Inspect the loaded object for CRS, bounds, feature count, metadata
3. Check for issues using these codes:
   - CORRUPT_FILE: file cannot be loaded (severity: fail)
   - MISSING_CRS: no coordinate reference system (severity: warn)
   - CRS_MISMATCH: CRS doesn't match coordinate values (severity: warn)
   - BOUNDS_DEGENERATE: zero-area or implausible bounds (severity: warn)
   - BOUNDS_OFFWORLD: coordinates outside valid range (severity: fail)
   - EMPTY_DATASET: zero features/points (severity: fail)
   - LOW_FEATURES: suspiciously few features (severity: warn)
   - UNCLASSIFIED: point cloud fully unclassified (severity: warn)
   - EXACT_DUPLICATE: SHA256 matches existing catalog entry (severity: warn)
   - GEOMETRY_ERRORS: invalid geometries detected (severity: warn)
4. Render a thumbnail if possible (use render_object)
5. Set the overall verdict: "pass" if no issues, "warn" if only warnings, "fail" if any failures

## Output format
Return ONLY a JSON object:
{{
  "candidates": [
    {{
      "name": "candidate_name",
      "verdict": "pass" | "warn" | "fail",
      "issues": [
        {{"severity": "warn", "code": "MISSING_CRS", "message": "Human-readable description"}}
      ],
      "metadata": {{"crs": "...", "bounds": [...], "feature_count": 1234}},
      "thumbnail_path": "/path/to/rendered/thumbnail.png or null",
      "summary": "One-sentence human-readable summary of findings"
    }}
  ]
}}"""

CATALOG_REVIEW_SYSTEM_PROMPT = """\
You are a catalog health reviewer for the DTCC Atlas platform.
You have access to dtcc-agent MCP tools for inspecting geospatial datasets.

Analyze the catalog for health issues and return a structured JSON report.
Return ONLY valid JSON matching the requested output format."""

CATALOG_REVIEW_PROMPT_TEMPLATE = """\
Review the following dataset catalog for health issues.

## Datasets
{datasets_block}

## Instructions
Check for:
1. DUPLICATE_DATA: datasets with identical SHA256 checksums or highly overlapping bounds + same type
2. STALE_VERSIONS: old versions superseded by newer uploads
3. CRS_INCONSISTENCY: datasets in the same geographic area using different CRS
4. COVERAGE_GAP: areas with some data types but missing others (e.g., buildings but no terrain)
5. NAMING_INCONSISTENCY: inconsistent naming patterns across datasets

## Output format
Return ONLY a JSON object:
{{
  "health_score": 0-100,
  "issues": [
    {{
      "code": "DUPLICATE_DATA",
      "severity": "warn",
      "datasets": ["dataset-a", "dataset-b"],
      "message": "Human-readable description"
    }}
  ],
  "summary": "Overall catalog health summary"
}}"""


def build_quality_prompt(
    candidates: list[dict[str, Any]],
    batch_root: str,
    existing_datasets: list[dict[str, Any]],
) -> str:
    """Build the quality check prompt from candidates and catalog state."""
    candidate_lines = []
    for i, c in enumerate(candidates, 1):
        crs = c.get("metadata", {}).get("crs", "unknown")
        sidecars = ", ".join(c.get("group_rel_paths", []))
        candidate_lines.append(
            f"{i}. Name: \"{c['name']}\", Type: {c.get('inferred_type', 'unknown')}, "
            f"Path: {batch_root}/{c.get('primary_rel_path', '')}\n"
            f"   Sidecars: {sidecars}\n"
            f"   Detected CRS: {crs}"
        )
    candidates_block = "\n".join(candidate_lines) if candidate_lines else "(none)"

    existing_lines = []
    for d in existing_datasets:
        sha_list = ", ".join(d.get("sha256_list", []))
        existing_lines.append(f"- {d['dataset_name']} (sha256: {sha_list})")
    existing_block = "\n".join(existing_lines) if existing_lines else "(none)"

    return QUALITY_PROMPT_TEMPLATE.format(
        candidates_block=candidates_block,
        existing_block=existing_block,
        batch_root=batch_root,
    )


def build_catalog_review_prompt(
    datasets: list[dict[str, Any]],
) -> str:
    """Build the catalog review prompt from the full dataset list."""
    lines = []
    for d in datasets:
        crs = d.get("crs", "unknown")
        bounds = d.get("bounds", "unknown")
        lines.append(
            f"- {d['dataset_name']} v{d.get('version', '?')} "
            f"(type: {d.get('inferred_type', '?')}, crs: {crs}, bounds: {bounds})"
        )
    datasets_block = "\n".join(lines) if lines else "(none)"
    return CATALOG_REVIEW_PROMPT_TEMPLATE.format(datasets_block=datasets_block)


def _run_claude(prompt: str, system_prompt: str) -> dict[str, Any] | None:
    """Spawn claude -p subprocess and parse JSON output."""
    cmd = ["claude", "-p", "--output-format", "json"]

    if MCP_CONFIG_PATH.exists():
        cmd.extend(["--mcp-config", str(MCP_CONFIG_PATH)])

    cmd.extend(["--system-prompt", system_prompt])
    cmd.append(prompt)

    logger.info("Spawning claude subprocess: %s", " ".join(cmd[:6]) + " ...")

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=CLAUDE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        logger.error("Claude subprocess timed out after %ds", CLAUDE_TIMEOUT)
        return None

    if proc.returncode != 0:
        logger.error("Claude subprocess failed (rc=%d): %s", proc.returncode, proc.stderr[:500])
        return None

    stdout = proc.stdout.strip()
    if not stdout:
        logger.error("Claude subprocess returned empty output")
        return None

    try:
        parsed = json.loads(stdout)
        # claude --output-format json wraps in {"result": ..., "cost_usd": ...}
        # Extract the result if wrapped
        if isinstance(parsed, dict) and "result" in parsed:
            inner = parsed["result"]
            # The result may be a JSON string that needs another parse
            if isinstance(inner, str):
                return json.loads(inner)
            return inner
        return parsed
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code blocks
        import re
        match = re.search(r"```(?:json)?\s*\n(.*?)\n```", stdout, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        logger.error("Failed to parse Claude output as JSON: %s", stdout[:300])
        return None


def run_claude_quality_check(
    candidates: list[dict[str, Any]],
    batch_root: str,
    existing_datasets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Run a quality check on upload candidates via Claude CLI."""
    prompt = build_quality_prompt(candidates, batch_root, existing_datasets)
    return _run_claude(prompt, QUALITY_SYSTEM_PROMPT)


def run_claude_catalog_review(
    datasets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Run a catalog health review via Claude CLI."""
    prompt = build_catalog_review_prompt(datasets)
    return _run_claude(prompt, CATALOG_REVIEW_SYSTEM_PROMPT)
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_claude_runner.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add server/upload/claude_runner.py tests/test_claude_runner.py
git commit -m "feat: add Claude CLI subprocess wrapper for quality checks"
```

---

## Task 3: Create the MCP config file

**Files:**
- Create: `.mcp.json` (project root)

**Step 1: No test needed — config file only**

**Step 2: Create the file**

Create `.mcp.json` at project root:

```json
{
  "mcpServers": {
    "dtcc-agent": {
      "command": "conda",
      "args": [
        "run",
        "--no-capture-output",
        "-n",
        "fenicsx-env",
        "python",
        "-m",
        "dtcc_agent"
      ]
    }
  }
}
```

**Step 3: Commit**

```bash
git add .mcp.json
git commit -m "config: add MCP config for dtcc-agent integration"
```

---

## Task 4: Add quality-check API endpoint with SSE streaming

**Files:**
- Create: `server/upload/quality_gate.py`
- Modify: `server/upload/routes.py` (add new endpoint)
- Test: `tests/test_quality_gate.py`

**Step 1: Write the failing test**

Create `tests/test_quality_gate.py`:

```python
"""Tests for quality gate endpoint logic."""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

from server.upload.catalog import UploadCatalog
from server.upload.quality_gate import run_quality_gate


def _setup_batch(tmp_path: Path) -> tuple[UploadCatalog, str]:
    """Create a catalog with a test batch and candidates."""
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)
    batch_id = "test-batch"
    batch_root = tmp_path / "uploads" / batch_id
    batch_root.mkdir(parents=True)

    catalog.create_batch(
        batch_id=batch_id,
        name="Test",
        root_dir=str(batch_root),
        file_count=1,
        total_bytes=100,
    )
    candidates = [
        {
            "id": "c1",
            "candidate_key": "buildings",
            "name": "buildings",
            "title": "buildings",
            "inferred_type": "vector",
            "role": "generic-vector",
            "confidence": "medium",
            "primary_rel_path": "buildings.shp",
            "group_rel_paths": ["buildings.shp"],
            "warnings": [],
            "metadata": {"crs": "EPSG:3006"},
            "detected_format": "shp",
        }
    ]
    catalog.replace_candidates(batch_id, candidates)
    return catalog, batch_id


def test_run_quality_gate_stores_verdicts(tmp_path: Path):
    """Quality gate should update candidate verdicts in catalog."""
    catalog, batch_id = _setup_batch(tmp_path)

    mock_claude_result = {
        "candidates": [
            {
                "name": "buildings",
                "verdict": "warn",
                "issues": [{"severity": "warn", "code": "MISSING_CRS", "message": "No CRS"}],
                "metadata": {"crs": None},
                "thumbnail_path": None,
                "summary": "Missing CRS.",
            }
        ]
    }

    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=mock_claude_result,
    ):
        result = run_quality_gate(catalog, batch_id)

    assert result is not None
    assert result["candidates"][0]["verdict"] == "warn"

    # Verify persisted in catalog
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "completed"

    loaded = catalog.list_candidates(batch_id)
    assert loaded[0]["verdict"] == "warn"
    assert loaded[0]["verdict_summary"] == "Missing CRS."


def test_run_quality_gate_handles_claude_failure(tmp_path: Path):
    """Quality gate should mark status as failed if Claude returns None."""
    catalog, batch_id = _setup_batch(tmp_path)

    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=None,
    ):
        result = run_quality_gate(catalog, batch_id)

    assert result is None
    batch = catalog.get_batch(batch_id)
    assert batch["quality_check_status"] == "failed"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_quality_gate.py -v`
Expected: FAIL — `server.upload.quality_gate` does not exist.

**Step 3: Write minimal implementation**

Create `server/upload/quality_gate.py`:

```python
"""Quality gate: orchestrate Claude CLI quality checks on upload candidates."""

from __future__ import annotations

import logging
from typing import Any

from .catalog import UploadCatalog
from .claude_runner import run_claude_quality_check

logger = logging.getLogger(__name__)


def _collect_existing_datasets(catalog: UploadCatalog) -> list[dict[str, Any]]:
    """Gather existing dataset info for duplicate detection."""
    datasets = catalog.list_uploaded_datasets(latest_only=False)
    result = []
    for d in datasets:
        # Collect SHA256 hashes from batch files if available
        batch_files = catalog.list_batch_files(d.get("source_batch_id", ""))
        sha_list = [f["sha256"] for f in batch_files if f.get("sha256")]
        result.append({
            "dataset_name": d["dataset_name"],
            "sha256_list": sha_list,
        })
    return result


def run_quality_gate(
    catalog: UploadCatalog,
    batch_id: str,
) -> dict[str, Any] | None:
    """Run the quality gate on a batch's candidates.

    Returns the Claude verdict dict, or None if the check failed.
    Updates catalog with status and per-candidate verdicts.
    """
    batch = catalog.get_batch(batch_id)
    if not batch:
        logger.error("Batch %s not found", batch_id)
        return None

    candidates = catalog.list_candidates(batch_id)
    if not candidates:
        logger.warning("No candidates for batch %s", batch_id)
        return None

    catalog.update_quality_check(batch_id, status="running")

    existing = _collect_existing_datasets(catalog)

    result = run_claude_quality_check(
        candidates=candidates,
        batch_root=batch["root_dir"],
        existing_datasets=existing,
    )

    if result is None:
        catalog.update_quality_check(batch_id, status="failed")
        return None

    # Match Claude's verdicts back to candidate IDs by name
    verdict_map: dict[str, dict[str, Any]] = {}
    for v in result.get("candidates", []):
        verdict_map[v["name"]] = v

    for candidate in candidates:
        verdict_data = verdict_map.get(candidate["name"])
        if verdict_data:
            catalog.update_candidate_verdict(
                candidate_id=candidate["id"],
                verdict=verdict_data.get("verdict", "pass"),
                issues=verdict_data.get("issues", []),
                summary=verdict_data.get("summary", ""),
                thumbnail_path=verdict_data.get("thumbnail_path"),
            )

    catalog.update_quality_check(batch_id, status="completed", result=result)
    return result
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_quality_gate.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/upload/quality_gate.py tests/test_quality_gate.py
git commit -m "feat: add quality gate orchestrator for upload candidates"
```

---

## Task 5: Wire quality-check endpoint into routes

**Files:**
- Modify: `server/upload/routes.py` (add POST + GET SSE endpoints)
- Test: `tests/test_quality_gate_api.py`

**Step 1: Write the failing test**

Create `tests/test_quality_gate_api.py`:

```python
"""Tests for quality gate API endpoints."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from server.upload.catalog import UploadCatalog


@pytest.fixture
def app_client(tmp_path: Path):
    """Create a test client with mocked catalog paths."""
    with patch("server.upload.service.CATALOG_DB_PATH", tmp_path / "catalog.db"), \
         patch("server.upload.service.CATALOG_DATASETS_DIR", tmp_path / "datasets"), \
         patch("server.config.UPLOAD_RAW_DIR", tmp_path / "raw"), \
         patch("server.config.CATALOG_DATASETS_DIR", tmp_path / "datasets"), \
         patch("server.config.CATALOG_DB_PATH", tmp_path / "catalog.db"):

        # Reset singleton
        import server.upload.service as svc
        svc._catalog_singleton = None

        from server.upload.routes import create_upload_router
        from fastapi import FastAPI

        app = FastAPI()
        router = create_upload_router()
        app.include_router(router, prefix="/api/v1")

        catalog = svc.get_catalog()

        # Seed a batch
        batch_root = tmp_path / "raw" / "test-batch"
        batch_root.mkdir(parents=True)
        catalog.create_batch(
            batch_id="test-batch",
            name="Test",
            root_dir=str(batch_root),
            file_count=1,
            total_bytes=100,
        )
        catalog.replace_candidates("test-batch", [
            {
                "id": "c1",
                "candidate_key": "test",
                "name": "test",
                "title": "test",
                "inferred_type": "vector",
                "role": "generic-vector",
                "confidence": "medium",
                "primary_rel_path": "test.shp",
                "group_rel_paths": ["test.shp"],
                "warnings": [],
                "metadata": {},
                "detected_format": "shp",
            }
        ])

        yield TestClient(app)


def test_quality_check_endpoint_returns_result(app_client):
    mock_result = {
        "candidates": [
            {
                "name": "test",
                "verdict": "pass",
                "issues": [],
                "metadata": {},
                "summary": "All good.",
                "thumbnail_path": None,
            }
        ]
    }
    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=mock_result,
    ):
        resp = app_client.post("/api/v1/uploads/batches/test-batch/quality-check")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["result"]["candidates"][0]["verdict"] == "pass"


def test_quality_check_endpoint_404_for_missing_batch(app_client):
    resp = app_client.post("/api/v1/uploads/batches/nonexistent/quality-check")
    assert resp.status_code == 404
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_quality_gate_api.py -v`
Expected: FAIL — no quality-check endpoint registered.

**Step 3: Write minimal implementation**

Add to `server/upload/routes.py`, inside `create_upload_router()`, after the existing endpoints:

```python
@router.post("/batches/{batch_id}/quality-check")
async def quality_check(batch_id: str):
    """Trigger an AI quality check on the batch's candidates."""
    catalog = get_catalog()
    batch = catalog.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    from .quality_gate import run_quality_gate

    result = run_quality_gate(catalog, batch_id)
    if result is None:
        raise HTTPException(status_code=502, detail="Quality check failed")

    return {
        "batch_id": batch_id,
        "status": "completed",
        "result": result,
    }

@router.get("/batches/{batch_id}/quality-check")
async def get_quality_check(batch_id: str):
    """Get the stored quality check result for a batch."""
    catalog = get_catalog()
    batch = catalog.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    candidates = catalog.list_candidates(batch_id)
    return {
        "batch_id": batch_id,
        "status": batch.get("quality_check_status"),
        "candidates": candidates,
    }
```

Add the necessary import at the top of routes.py (if not already present):
```python
from .service import get_catalog
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_quality_gate_api.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/upload/routes.py tests/test_quality_gate_api.py
git commit -m "feat: add quality-check POST+GET endpoints to upload routes"
```

---

## Task 6: Add catalog review endpoint

**Files:**
- Create: `server/upload/catalog_review.py`
- Modify: `server/upload/routes.py` (add catalog review endpoints)
- Test: `tests/test_catalog_review.py`

**Step 1: Write the failing test**

Create `tests/test_catalog_review.py`:

```python
"""Tests for catalog review logic."""

from pathlib import Path
from unittest.mock import patch

from server.upload.catalog import UploadCatalog
from server.upload.catalog_review import run_catalog_review


def test_run_catalog_review_returns_report(tmp_path: Path):
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    # Insert a dataset
    catalog.insert_uploaded_dataset({
        "id": "d1",
        "dataset_name": "buildings",
        "title": "Buildings",
        "version": 1,
        "inferred_type": "vector",
        "role": "generic-vector",
        "source_batch_id": "b1",
        "storage_dir": "/tmp/a",
        "primary_file": "/tmp/a/data.geojson",
        "detected_format": "geojson",
        "crs": "EPSG:3006",
        "bounds": [0, 0, 1, 1],
        "metadata": {},
        "status": "active",
    })

    mock_result = {
        "health_score": 85,
        "issues": [],
        "summary": "Catalog looks healthy.",
    }

    with patch(
        "server.upload.catalog_review.run_claude_catalog_review",
        return_value=mock_result,
    ):
        result = run_catalog_review(catalog)

    assert result is not None
    assert result["health_score"] == 85


def test_run_catalog_review_handles_failure(tmp_path: Path):
    db_path = tmp_path / "catalog.db"
    catalog = UploadCatalog(db_path)

    with patch(
        "server.upload.catalog_review.run_claude_catalog_review",
        return_value=None,
    ):
        result = run_catalog_review(catalog)

    assert result is None
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_catalog_review.py -v`
Expected: FAIL — module does not exist.

**Step 3: Write implementation**

Create `server/upload/catalog_review.py`:

```python
"""Catalog health review: orchestrate Claude CLI review of the full catalog."""

from __future__ import annotations

import logging
from typing import Any

from .catalog import UploadCatalog
from .claude_runner import run_claude_catalog_review

logger = logging.getLogger(__name__)


def run_catalog_review(catalog: UploadCatalog) -> dict[str, Any] | None:
    """Run a health review on the full dataset catalog.

    Returns the Claude report dict, or None if the review failed.
    """
    datasets = catalog.list_uploaded_datasets(latest_only=False)
    if not datasets:
        return {"health_score": 100, "issues": [], "summary": "Catalog is empty."}

    result = run_claude_catalog_review(datasets)
    if result is None:
        logger.error("Catalog review failed — Claude returned None")
        return None

    # Update last_review_at on datasets that were reviewed
    for d in datasets:
        if d.get("id"):
            try:
                catalog.update_dataset_review(
                    dataset_id=d["id"],
                    review_issues=result.get("issues", []),
                )
            except Exception:
                logger.warning("Could not update review for dataset %s", d["id"])

    return result
```

Add `update_dataset_review` to `server/upload/catalog.py`:

```python
def update_dataset_review(
    self, dataset_id: str, review_issues: list[dict[str, Any]]
) -> None:
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE uploaded_datasets SET last_review_at = ?, review_issues = ? WHERE id = ?",
            (_utc_now_iso(), json.dumps(review_issues), dataset_id),
        )
```

Add the catalog review endpoint to `server/upload/routes.py`:

```python
@router.post("/catalog/review")
async def catalog_review():
    """Trigger an AI health review of the full dataset catalog."""
    catalog = get_catalog()

    from .catalog_review import run_catalog_review

    result = run_catalog_review(catalog)
    if result is None:
        raise HTTPException(status_code=502, detail="Catalog review failed")

    return {"status": "completed", "result": result}
```

**Step 4: Run tests**

Run: `python -m pytest tests/test_catalog_review.py tests/test_upload_catalog.py -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add server/upload/catalog_review.py server/upload/catalog.py server/upload/routes.py tests/test_catalog_review.py
git commit -m "feat: add catalog health review endpoint"
```

---

## Task 7: Add quality-check API client to frontend

**Files:**
- Modify: `frontend/src/lib/api/upload-api.ts` (add quality check + catalog review API calls)

**Step 1: No separate test — covered by integration in Task 8**

**Step 2: Add to `frontend/src/lib/api/upload-api.ts`**

Append these types and functions:

```typescript
// -- Quality Gate types --

export interface QualityIssue {
  severity: 'warn' | 'fail'
  code: string
  message: string
}

export interface CandidateVerdict {
  name: string
  verdict: 'pass' | 'warn' | 'fail'
  issues: QualityIssue[]
  metadata: Record<string, unknown>
  thumbnail_path: string | null
  summary: string
}

export interface QualityCheckResult {
  batch_id: string
  status: 'completed' | 'failed'
  result: {
    candidates: CandidateVerdict[]
  }
}

export interface CatalogReviewResult {
  status: 'completed' | 'failed'
  result: {
    health_score: number
    issues: Array<{
      code: string
      severity: string
      datasets: string[]
      message: string
    }>
    summary: string
  }
}

// -- Quality Gate API calls --

export async function runQualityCheck(batchId: string): Promise<QualityCheckResult> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/batches/${encodeURIComponent(batchId)}/quality-check`,
    { method: 'POST' },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Quality check failed')
  }
  return response.json()
}

export async function getQualityCheck(batchId: string): Promise<{
  batch_id: string
  status: string | null
  candidates: (UploadCandidate & {
    verdict?: string | null
    verdict_issues?: QualityIssue[] | null
    verdict_summary?: string | null
    thumbnail_path?: string | null
  })[]
}> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/batches/${encodeURIComponent(batchId)}/quality-check`,
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to get quality check')
  }
  return response.json()
}

export async function runCatalogReview(): Promise<CatalogReviewResult> {
  const response = await fetch(`${API_BASE_URL}/uploads/catalog/review`, {
    method: 'POST',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Catalog review failed')
  }
  return response.json()
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api/upload-api.ts
git commit -m "feat: add quality-check and catalog-review API client functions"
```

---

## Task 8: Add "Analyze Quality" button to UploadWizard

**Files:**
- Modify: `frontend/src/lib/components/UploadWizard.svelte`

**Step 1: No unit test — manual verification in browser**

**Step 2: Add quality check UI to the review step**

In `UploadWizard.svelte`, add state variables in the `<script>` block:

```typescript
import {
  createUploadBatch,
  ingestUploadBatch,
  runQualityCheck,
  type UploadCandidate,
  type UploadBatchProgress,
  type IngestCandidateOverride,
  type CandidateVerdict,
} from '../api/upload-api'

// ... existing state ...

let qualityChecking = $state(false)
let qualityVerdicts: Record<string, CandidateVerdict> = $state({})
let qualityError: string = $state('')

async function analyzeQuality() {
  if (!batchId) return
  qualityChecking = true
  qualityError = ''
  try {
    const resp = await runQualityCheck(batchId)
    const verdictMap: Record<string, CandidateVerdict> = {}
    for (const v of resp.result.candidates) {
      verdictMap[v.name] = v
    }
    qualityVerdicts = verdictMap
  } catch (e) {
    qualityError = e instanceof Error ? e.message : 'Quality check failed'
  } finally {
    qualityChecking = false
  }
}
```

In the review step template (`{:else if step === 'review'}`), add the "Analyze Quality" button and verdict display. Insert after the description paragraph and before the candidates list:

```svelte
<!-- Quality check button -->
<button
  class="h-9 w-full rounded-lg text-[12px] font-medium transition-colors cursor-pointer
    {qualityChecking
      ? 'bg-amber-100 text-amber-700 cursor-wait'
      : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}"
  disabled={qualityChecking}
  onclick={analyzeQuality}
>
  {qualityChecking ? 'Analyzing quality...' : 'Analyze Quality (AI)'}
</button>
{#if qualityError}
  <div class="text-[12px] text-red-600">{qualityError}</div>
{/if}
```

Inside each candidate card (after the warnings display at line ~289-293), add verdict display:

```svelte
{#if qualityVerdicts[candidate.name]}
  {@const v = qualityVerdicts[candidate.name]}
  <div class="mt-2 p-2 rounded text-[11px]
    {v.verdict === 'pass' ? 'bg-green-50 text-green-700' :
     v.verdict === 'warn' ? 'bg-amber-50 text-amber-700' :
     'bg-red-50 text-red-700'}">
    <div class="font-medium mb-1">
      {v.verdict === 'pass' ? 'PASS' : v.verdict === 'warn' ? 'WARNING' : 'FAIL'}
    </div>
    <div>{v.summary}</div>
    {#if v.issues.length > 0}
      <ul class="mt-1 list-disc list-inside">
        {#each v.issues as issue}
          <li>{issue.code}: {issue.message}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
```

Also reset quality state in `resetWizard()`:

```typescript
qualityVerdicts = {}
qualityError = ''
qualityChecking = false
```

**Step 3: Commit**

```bash
git add frontend/src/lib/components/UploadWizard.svelte
git commit -m "feat: add Analyze Quality button to upload wizard review step"
```

---

## Task 9: Run all tests and verify

**Files:** None (verification only)

**Step 1: Run the full test suite**

```bash
python -m pytest tests/ -v
```

Expected: All existing tests still pass, plus the new tests from tasks 1-6.

**Step 2: Manual verification checklist**

1. Start Atlas backend: `python -m server.main` (or however the dev server runs)
2. Open the upload wizard in the browser
3. Upload a test file (e.g., a small .geojson)
4. In the review step, click "Analyze Quality"
5. Verify: loading state shows, then verdicts appear per candidate
6. Verify: you can still ingest normally after quality check

**Step 3: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```

---

## Task 10: Final integration commit and cleanup

**Files:**
- Modify: `server/upload/__init__.py` (export new public functions)

**Step 1: Update `server/upload/__init__.py`**

Add to the exports if any new public functions need to be accessible from outside the module.

**Step 2: Run final test suite**

```bash
python -m pytest tests/ -v --tb=short
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete agentic quality gate integration"
```

---

## File Summary

| File | Action | Task |
|------|--------|------|
| `server/upload/catalog.py` | Modify (schema + 3 methods) | 1, 6 |
| `server/upload/claude_runner.py` | Create | 2 |
| `server/upload/quality_gate.py` | Create | 4 |
| `server/upload/catalog_review.py` | Create | 6 |
| `server/upload/routes.py` | Modify (3 endpoints) | 5, 6 |
| `server/upload/__init__.py` | Modify (exports) | 10 |
| `.mcp.json` | Create | 3 |
| `frontend/src/lib/api/upload-api.ts` | Modify (types + 3 functions) | 7 |
| `frontend/src/lib/components/UploadWizard.svelte` | Modify (quality UI) | 8 |
| `tests/test_upload_catalog.py` | Modify (1 test) | 1 |
| `tests/test_claude_runner.py` | Create (4 tests) | 2 |
| `tests/test_quality_gate.py` | Create (2 tests) | 4 |
| `tests/test_quality_gate_api.py` | Create (2 tests) | 5 |
| `tests/test_catalog_review.py` | Create (2 tests) | 6 |
