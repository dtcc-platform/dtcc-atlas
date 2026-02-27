"""Quality gate orchestrator for upload candidates.

Bridges the upload catalog (Task 1) and the Claude CLI runner (Task 2) to
run automated quality checks on newly uploaded datasets before ingestion.
"""

from __future__ import annotations

import logging
from typing import Any

from .catalog import UploadCatalog
from .claude_runner import run_claude_quality_check

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
    """Orchestrate a Claude CLI quality check on all candidates in a batch.

    1. Retrieves the batch and its candidates from the catalog.
    2. Sets ``quality_check_status`` to ``"running"``.
    3. Calls :func:`run_claude_quality_check` with the candidates, batch
       root directory, and existing dataset hashes for duplicate detection.
    4. If Claude returns ``None``, sets status to ``"failed"`` and returns
       ``None``.
    5. Otherwise, matches each Claude verdict back to the catalog candidate
       by name and persists the verdict via
       :meth:`UploadCatalog.update_candidate_verdict`.
    6. Sets status to ``"completed"`` with the full result JSON.
    7. Returns the result dict.
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

    # Run the Claude quality check
    result = run_claude_quality_check(candidates, batch_root, existing_datasets)

    if result is None:
        logger.error("Claude quality check failed for batch %s", batch_id)
        catalog.update_quality_check(batch_id, status="failed", result=None)
        return None

    # Build a lookup from candidate name -> candidate id for verdict matching
    name_to_id: dict[str, str] = {c["name"]: c["id"] for c in candidates}

    # Match Claude verdicts back to candidate IDs and persist
    for claude_candidate in result.get("candidates", []):
        cname = claude_candidate.get("name", "")
        candidate_id = name_to_id.get(cname)
        if candidate_id is None:
            logger.warning(
                "Claude returned verdict for unknown candidate %r", cname
            )
            continue

        catalog.update_candidate_verdict(
            candidate_id=candidate_id,
            verdict=claude_candidate.get("verdict", "unknown"),
            issues=claude_candidate.get("issues", []),
            summary=claude_candidate.get("summary", ""),
            thumbnail_path=claude_candidate.get("thumbnail_path"),
        )

    # Mark quality check as completed with full result
    catalog.update_quality_check(batch_id, status="completed", result=result)

    return result
