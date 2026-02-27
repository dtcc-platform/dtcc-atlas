"""Spawn Claude CLI to run quality checks via dtcc-agent MCP tools."""

from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from server.config import BASE_DIR

logger = logging.getLogger(__name__)

# MCP config path -- points claude -p to the dtcc-agent MCP server
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
    """Build the quality check prompt from candidates and catalog state.

    Formats candidates as a numbered list with name, type, path, sidecars,
    and CRS.  Formats existing datasets with SHA256 hashes for duplicate
    detection.  Returns the populated QUALITY_PROMPT_TEMPLATE string.
    """
    candidate_lines: list[str] = []
    for i, c in enumerate(candidates, 1):
        crs = c.get("metadata", {}).get("crs", "unknown")
        sidecars = ", ".join(c.get("group_rel_paths", []))
        candidate_lines.append(
            f'{i}. Name: "{c["name"]}", Type: {c.get("inferred_type", "unknown")}, '
            f"Path: {batch_root}/{c.get('primary_rel_path', '')}\n"
            f"   Sidecars: {sidecars}\n"
            f"   Detected CRS: {crs}"
        )
    candidates_block = "\n".join(candidate_lines) if candidate_lines else "(none)"

    existing_lines: list[str] = []
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
    """Build the catalog review prompt from the full dataset list.

    Formats each dataset with name, version, type, CRS, and bounds.
    Returns the populated CATALOG_REVIEW_PROMPT_TEMPLATE string.
    """
    lines: list[str] = []
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
    """Spawn ``claude -p`` subprocess and parse JSON output.

    Builds the command with ``--output-format json`` and optional
    ``--mcp-config`` if the config file exists.  Handles timeout (120 s),
    non-zero return code, and empty output.  Parses JSON output, unwrapping
    the ``{"result": ...}`` envelope that ``claude --output-format json``
    produces.  Falls back to extracting JSON from markdown code blocks when
    direct parsing fails.

    Returns the parsed dict or ``None`` on any failure.
    """
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
        logger.error(
            "Claude subprocess failed (rc=%d): %s",
            proc.returncode,
            proc.stderr[:500],
        )
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
