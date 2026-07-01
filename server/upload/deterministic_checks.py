"""Deterministic quality pre-checks for upload candidates.

Pure functions — no LLM, no subprocess. Runs instantly after scan to
provide immediate quality verdicts before optional AI enrichment.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def check_candidate(
    candidate: dict[str, Any],
    existing_datasets: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run all deterministic checks on a single candidate.

    Returns ``{"verdict": "pass"|"warn"|"fail", "issues": [...], "summary": "..."}``.
    Each issue is ``{"severity": "warn"|"fail", "code": "...", "message": "..."}``.
    """
    issues: list[dict[str, str]] = []
    meta = candidate.get("metadata") or {}
    warnings = candidate.get("warnings") or []

    _check_empty_dataset(meta, warnings, issues)
    _check_missing_crs(meta, issues)
    _check_bounds_offworld(meta, issues)
    _check_bounds_degenerate(meta, issues)
    _check_low_features(meta, issues)
    _check_exact_duplicate(candidate, existing_datasets, issues)
    _check_crs_mismatch(meta, issues)
    _check_geometry_errors(warnings, issues)

    verdict = _compute_verdict(issues)
    summary = _build_summary(candidate, verdict, issues)

    return {"verdict": verdict, "issues": issues, "summary": summary}


def check_all_candidates(
    candidates: list[dict[str, Any]],
    existing_datasets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Run deterministic checks on all candidates in a batch.

    Returns a list of ``{"name": ..., "verdict": ..., "issues": [...], "summary": ...}``
    in the same order as the input candidates.
    """
    results = []
    for c in candidates:
        result = check_candidate(c, existing_datasets)
        result["name"] = c["name"]
        results.append(result)
    return results


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def _check_empty_dataset(
    meta: dict[str, Any], warnings: list[str], issues: list[dict[str, str]]
) -> None:
    """EMPTY_DATASET (fail): count == 0 or missing metadata with scan warning."""
    count = meta.get("count")
    if count is not None and count == 0:
        issues.append(
            {
                "severity": "fail",
                "code": "EMPTY_DATASET",
                "message": "Dataset contains zero features or points.",
            }
        )
        return

    # If count is missing and there are scan warnings, flag it
    if count is None and warnings:
        for w in warnings:
            if "empty" in w.lower() or "no features" in w.lower():
                issues.append(
                    {
                        "severity": "fail",
                        "code": "EMPTY_DATASET",
                        "message": f"Dataset appears empty: {w}",
                    }
                )
                return


def _check_missing_crs(meta: dict[str, Any], issues: list[dict[str, str]]) -> None:
    """MISSING_CRS (warn): CRS is None or empty."""
    crs = meta.get("crs")
    if not crs:
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_CRS",
                "message": "No coordinate reference system detected.",
            }
        )


def _check_bounds_offworld(
    meta: dict[str, Any], issues: list[dict[str, str]]
) -> None:
    """BOUNDS_OFFWORLD (fail): For EPSG:4326, lon outside [-180,180] or lat outside [-90,90]."""
    crs = str(meta.get("crs", ""))
    bounds = meta.get("bounds")
    if not bounds or not isinstance(bounds, (list, tuple)) or len(bounds) < 4:
        return

    if not _is_epsg_4326(crs):
        return

    xmin, ymin, xmax, ymax = bounds[0], bounds[1], bounds[2], bounds[3]
    try:
        xmin, ymin, xmax, ymax = float(xmin), float(ymin), float(xmax), float(ymax)
    except (TypeError, ValueError):
        return

    if xmin < -180 or xmax > 180 or ymin < -90 or ymax > 90:
        issues.append(
            {
                "severity": "fail",
                "code": "BOUNDS_OFFWORLD",
                "message": (
                    f"Coordinates outside valid WGS84 range: "
                    f"[{xmin}, {ymin}, {xmax}, {ymax}]. "
                    f"Expected lon in [-180, 180], lat in [-90, 90]."
                ),
            }
        )


def _check_bounds_degenerate(
    meta: dict[str, Any], issues: list[dict[str, str]]
) -> None:
    """BOUNDS_DEGENERATE (warn): xmin == xmax or ymin == ymax (zero area)."""
    bounds = meta.get("bounds")
    if not bounds or not isinstance(bounds, (list, tuple)) or len(bounds) < 4:
        return

    try:
        xmin, ymin, xmax, ymax = (
            float(bounds[0]),
            float(bounds[1]),
            float(bounds[2]),
            float(bounds[3]),
        )
    except (TypeError, ValueError):
        return

    if xmin == xmax or ymin == ymax:
        issues.append(
            {
                "severity": "warn",
                "code": "BOUNDS_DEGENERATE",
                "message": (
                    f"Zero-area bounding box: [{xmin}, {ymin}, {xmax}, {ymax}]. "
                    f"Dataset may be a single point or line."
                ),
            }
        )


def _check_low_features(
    meta: dict[str, Any], issues: list[dict[str, str]]
) -> None:
    """LOW_FEATURES (warn): count < 5."""
    count = meta.get("count")
    if count is not None and 0 < count < 5:
        issues.append(
            {
                "severity": "warn",
                "code": "LOW_FEATURES",
                "message": f"Very low feature count ({count}). May be incomplete.",
            }
        )


def _check_exact_duplicate(
    candidate: dict[str, Any],
    existing_datasets: list[dict[str, Any]],
    issues: list[dict[str, str]],
) -> None:
    """EXACT_DUPLICATE (warn): SHA256 match against existing datasets."""
    candidate_sha = (candidate.get("metadata") or {}).get("sha256")
    if not candidate_sha:
        return

    for ds in existing_datasets:
        sha_list = ds.get("sha256_list", [])
        if candidate_sha in sha_list:
            issues.append(
                {
                    "severity": "warn",
                    "code": "EXACT_DUPLICATE",
                    "message": (
                        f"File SHA256 matches existing dataset "
                        f"'{ds['dataset_name']}'."
                    ),
                }
            )
            return


def _check_crs_mismatch(
    meta: dict[str, Any], issues: list[dict[str, str]]
) -> None:
    """CRS_MISMATCH (warn): CRS says 4326 but coords > 1000, or CRS says projected but coords < 360."""
    crs = str(meta.get("crs", ""))
    bounds = meta.get("bounds")
    if not crs or not bounds or not isinstance(bounds, (list, tuple)) or len(bounds) < 4:
        return

    try:
        xmin, ymin, xmax, ymax = (
            float(bounds[0]),
            float(bounds[1]),
            float(bounds[2]),
            float(bounds[3]),
        )
    except (TypeError, ValueError):
        return

    max_abs = max(abs(xmin), abs(ymin), abs(xmax), abs(ymax))

    if _is_epsg_4326(crs) and max_abs > 1000:
        issues.append(
            {
                "severity": "warn",
                "code": "CRS_MISMATCH",
                "message": (
                    f"CRS is {crs} (geographic) but coordinates "
                    f"exceed 1000 (max abs: {max_abs:.0f}). "
                    f"Data may actually be in a projected CRS."
                ),
            }
        )
    elif not _is_epsg_4326(crs) and crs and max_abs < 360:
        issues.append(
            {
                "severity": "warn",
                "code": "CRS_MISMATCH",
                "message": (
                    f"CRS is {crs} (projected) but coordinates "
                    f"are small (max abs: {max_abs:.1f}). "
                    f"Data may actually be in geographic coordinates."
                ),
            }
        )


def _check_geometry_errors(
    warnings: list[str], issues: list[dict[str, str]]
) -> None:
    """GEOMETRY_ERRORS (warn): check warnings for geometry issues from scan."""
    geometry_keywords = [
        "geometry",
        "invalid",
        "self-intersect",
        "topology",
        "ring",
        "polygon",
    ]
    for w in warnings:
        wl = w.lower()
        if any(kw in wl for kw in geometry_keywords):
            issues.append(
                {
                    "severity": "warn",
                    "code": "GEOMETRY_ERRORS",
                    "message": w,
                }
            )
            return


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EPSG_4326_PATTERNS = re.compile(
    r"(epsg[:\s]*4326|wgs\s*84|urn:ogc:def:crs:EPSG::4326)",
    re.IGNORECASE,
)


def _is_epsg_4326(crs: str) -> bool:
    """Return True if the CRS string looks like WGS 84 / EPSG:4326."""
    return bool(_EPSG_4326_PATTERNS.search(crs))


def _compute_verdict(issues: list[dict[str, str]]) -> str:
    """Compute overall verdict: fail if any fail, warn if any warn, else pass."""
    severities = {i["severity"] for i in issues}
    if "fail" in severities:
        return "fail"
    if "warn" in severities:
        return "warn"
    return "pass"


def _build_summary(
    candidate: dict[str, Any], verdict: str, issues: list[dict[str, str]]
) -> str:
    """Build a one-sentence summary of the deterministic check results."""
    name = candidate.get("title") or candidate.get("name", "Unknown")
    if verdict == "pass":
        return f"{name}: all deterministic checks passed."
    codes = [i["code"] for i in issues]
    return f"{name}: {verdict.upper()} — {', '.join(codes)}."
