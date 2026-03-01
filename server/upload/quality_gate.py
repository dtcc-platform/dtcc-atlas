"""Quality gate orchestrator for upload candidates.

Runs deterministic pre-checks first (instant), then optionally enriches
with Claude AI for summaries and cross-file analysis.
"""

from __future__ import annotations

import logging
from typing import Any

from .catalog import UploadCatalog
from .claude_runner import run_claude_quality_check
from .deterministic_checks import check_all_candidates

logger = logging.getLogger(__name__)


def _collect_existing_datasets(catalog: UploadCatalog) -> list[dict[str, Any]]:
    """Gather all datasets with their file SHA256 hashes for duplicate detection.

    Iterates over every dataset version in the catalog (latest_only=False),
    looks up the source batch files for each, and collects their SHA256
    checksums into a flat list.

    Returns a list of ``{"dataset_name": ..., "sha256_list": [...]}``.
    """
    datasets = catalog.list_uploaded_datasets(latest_only=False)
    result: list[dict[str, Any]] = []
    for ds in datasets:
        source_batch_id = ds.get("source_batch_id")
        sha256_list: list[str] = []
        if source_batch_id:
            batch_files = catalog.list_batch_files(source_batch_id)
            sha256_list = [f["sha256"] for f in batch_files if f.get("sha256")]
        result.append(
            {
                "dataset_name": ds["dataset_name"],
                "sha256_list": sha256_list,
            }
        )
    return result


def run_quality_gate(
    catalog: UploadCatalog, batch_id: str
) -> dict[str, Any] | None:
    """Orchestrate AI-enriched quality check on all candidates in a batch.

    1. Retrieves the batch and its candidates (which already have
       deterministic verdicts from upload).
    2. Sets ``quality_check_status`` to ``"running"``.
    3. Runs deterministic checks to get a fresh baseline.
    4. Calls Claude for AI enrichment (summaries, cross-file analysis).
    5. Merges results: keeps all deterministic issues, adds AI summary
       and any extra AI-detected issues.
    6. Persists merged verdicts and sets status to ``"completed"``.
    """
    batch = catalog.get_batch(batch_id)
    if batch is None:
        logger.error("Batch %s not found", batch_id)
        return None

    candidates = catalog.list_candidates(batch_id)
    if not candidates:
        logger.warning("Batch %s has no candidates", batch_id)

    batch_root = batch["root_dir"]

    # Mark quality check as running
    catalog.update_quality_check(batch_id, status="running", result=None)

    # Collect existing datasets for duplicate detection
    existing_datasets = _collect_existing_datasets(catalog)

    # Step 1: Run deterministic checks (instant)
    det_verdicts = check_all_candidates(candidates, existing_datasets)
    det_by_name: dict[str, dict[str, Any]] = {v["name"]: v for v in det_verdicts}

    # Step 2: Run Claude AI enrichment
    ai_result = run_claude_quality_check(candidates, batch_root, existing_datasets)

    # Step 3: Merge deterministic + AI results
    name_to_id: dict[str, str] = {c["name"]: c["id"] for c in candidates}
    merged_candidates: list[dict[str, Any]] = []

    for det in det_verdicts:
        cname = det["name"]
        merged = _merge_verdict(det, ai_result, cname)
        merged_candidates.append(merged)

        candidate_id = name_to_id.get(cname)
        if candidate_id:
            catalog.update_candidate_verdict(
                candidate_id=candidate_id,
                verdict=merged["verdict"],
                issues=merged["issues"],
                summary=merged["summary"],
                thumbnail_path=merged.get("thumbnail_path"),
            )

    result = {"candidates": merged_candidates}

    if ai_result is None:
        logger.warning(
            "Claude AI enrichment failed for batch %s; "
            "deterministic verdicts preserved",
            batch_id,
        )
        # Still mark as completed — deterministic checks succeeded
        catalog.update_quality_check(batch_id, status="completed", result=result)
    else:
        catalog.update_quality_check(batch_id, status="completed", result=result)

    return result


def _merge_verdict(
    det: dict[str, Any],
    ai_result: dict[str, Any] | None,
    candidate_name: str,
) -> dict[str, Any]:
    """Merge a deterministic verdict with AI enrichment for one candidate.

    - Keeps all deterministic issues.
    - Adds any extra AI-detected issues (by code) not already present.
    - Uses AI summary if available, appends to deterministic summary.
    - Takes the stricter verdict (fail > warn > pass).
    - Preserves AI thumbnail_path if available.
    """
    det_issues = [{**i, "source": "deterministic"} for i in det.get("issues", [])]
    det_codes = {i["code"] for i in det_issues}
    det_summary = det.get("summary", "")

    ai_candidate = _find_ai_candidate(ai_result, candidate_name)
    if ai_candidate is None:
        return {
            "name": candidate_name,
            "verdict": det["verdict"],
            "issues": det_issues,
            "summary": det_summary,
            "ai_summary": "",
            "thumbnail_path": None,
        }

    # Add AI-detected issues not already found by deterministic checks
    for ai_issue in ai_candidate.get("issues", []):
        if ai_issue.get("code") not in det_codes:
            det_issues.append({**ai_issue, "source": "ai"})

    # Keep summaries separate
    ai_summary = ai_candidate.get("summary", "")

    # Take the stricter verdict
    verdict = _stricter_verdict(det["verdict"], ai_candidate.get("verdict", "pass"))

    return {
        "name": candidate_name,
        "verdict": verdict,
        "issues": det_issues,
        "summary": det_summary,
        "ai_summary": ai_summary,
        "thumbnail_path": ai_candidate.get("thumbnail_path"),
    }


def _find_ai_candidate(
    ai_result: dict[str, Any] | None, name: str
) -> dict[str, Any] | None:
    """Find a candidate by name in the AI result."""
    if ai_result is None:
        return None
    for c in ai_result.get("candidates", []):
        if c.get("name") == name:
            return c
    return None


_SEVERITY_RANK = {"pass": 0, "warn": 1, "fail": 2}


def _stricter_verdict(a: str, b: str) -> str:
    """Return the stricter of two verdicts."""
    return a if _SEVERITY_RANK.get(a, 0) >= _SEVERITY_RANK.get(b, 0) else b
