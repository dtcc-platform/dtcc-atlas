"""Catalog health review orchestrator.

Bridges the upload catalog and the Claude CLI runner to perform
AI-driven health reviews of the full dataset catalog.
"""

from __future__ import annotations

import logging
from typing import Any

from .catalog import UploadCatalog
from .claude_runner import run_claude_catalog_review

logger = logging.getLogger(__name__)


def run_catalog_review(catalog: UploadCatalog) -> dict[str, Any] | None:
    """Run an AI catalog health review on all datasets.

    1. Retrieves all dataset versions from the catalog.
    2. If the catalog is empty, returns a perfect-health stub result.
    3. Calls :func:`run_claude_catalog_review` with the full dataset list.
    4. If Claude returns ``None``, logs an error and returns ``None``.
    5. For each dataset, tries to persist review issues via
       :meth:`UploadCatalog.update_dataset_review`.
    6. Returns the result dict.
    """
    datasets = catalog.list_uploaded_datasets(latest_only=False)

    if not datasets:
        return {"health_score": 100, "issues": [], "summary": "Catalog is empty."}

    result = run_claude_catalog_review(datasets)

    if result is None:
        logger.error("Claude catalog review failed")
        return None

    # Persist review issues back to individual datasets.
    # Build a lookup from dataset_name -> list of issues that mention it.
    dataset_issues: dict[str, list[dict[str, Any]]] = {}
    for issue in result.get("issues", []):
        for ds_name in issue.get("datasets", []):
            dataset_issues.setdefault(ds_name, []).append(issue)

    for ds in datasets:
        ds_id = ds["id"]
        ds_name = ds["dataset_name"]
        review_issues = dataset_issues.get(ds_name, [])
        try:
            catalog.update_dataset_review(ds_id, review_issues)
        except Exception:
            logger.exception(
                "Failed to update review for dataset %s (%s)", ds_name, ds_id
            )

    return result
