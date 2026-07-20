"""FastAPI routes for upload wizard and ingestion workflow."""

from __future__ import annotations

import hashlib
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from pyproj import Transformer

from server.config import UPLOAD_RAW_DIR, CATALOG_DATASETS_DIR
from server.logging import info

from .detection import is_ignored_upload_path, scan_candidates
from .deterministic_checks import check_all_candidates
from .ingest import ingest_candidate
from .quality_gate import _collect_existing_datasets, run_quality_gate
from .service import ensure_catalog_directories, get_catalog


def _safe_rel_path(filename: str) -> str:
    norm = filename.replace("\\", "/").lstrip("/")
    if not norm:
        norm = f"file-{uuid.uuid4().hex}"
    parts = [p for p in Path(norm).parts if p not in (".", "")]
    if any(p == ".." for p in parts):
        raise ValueError(f"Illegal filename path: {filename}")
    return str(Path(*parts))


def _file_ext(path: str) -> str:
    p = Path(path)
    suffixes = [s.lower() for s in p.suffixes]
    if len(suffixes) >= 2 and "".join(suffixes[-2:]) == ".json.zip":
        return ".json.zip"
    if len(suffixes) >= 2 and "".join(suffixes[-2:]) == ".shp.xml":
        return ".shp.xml"
    return p.suffix.lower()


def _default_batch_name() -> str:
    return f"Upload {datetime.now().strftime('%Y-%m-%d %H:%M')}"


class CandidateOverride(BaseModel):
    candidate_id: str
    keep: bool = True
    dataset_name: str | None = None
    role: str | None = None
    crs: str | None = None


class IngestRequest(BaseModel):
    candidates: list[CandidateOverride] = Field(default_factory=list)


def _compute_combined_bounds(
    ingested: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Compute the union bounding box of all ingested datasets in EPSG:3006.

    Each item in *ingested* should have ``bounds`` (list of 4 floats or None)
    and ``crs`` (string or None).  Items whose bounds are None or whose CRS is
    missing are silently skipped.  If no valid bounds remain, ``None`` is
    returned.
    """
    TARGET_CRS = "EPSG:3006"

    all_min_x: list[float] = []
    all_min_y: list[float] = []
    all_max_x: list[float] = []
    all_max_y: list[float] = []

    for item in ingested:
        bounds = item.get("bounds")
        crs = item.get("crs")
        if bounds is None or crs is None:
            continue
        if len(bounds) != 4:
            continue

        min_x, min_y, max_x, max_y = (float(v) for v in bounds)

        if crs.upper() != TARGET_CRS:
            try:
                transformer = Transformer.from_crs(crs, TARGET_CRS, always_xy=True)
                min_x, min_y = transformer.transform(min_x, min_y)
                max_x, max_y = transformer.transform(max_x, max_y)
            except Exception:
                continue

        all_min_x.append(min_x)
        all_min_y.append(min_y)
        all_max_x.append(max_x)
        all_max_y.append(max_y)

    if not all_min_x:
        return None

    return {
        "minX": min(all_min_x),
        "minY": min(all_min_y),
        "maxX": max(all_max_x),
        "maxY": max(all_max_y),
        "crs": TARGET_CRS,
    }


def create_upload_router() -> APIRouter:
    router = APIRouter(prefix="/uploads", tags=["uploads"])

    @router.post("/batches")
    async def create_batch(
        batch_name: str | None = Form(default=None),
        files: list[UploadFile] = File(...),
        x_session_id: str | None = Header(default=None),
    ):
        if not files:
            raise HTTPException(status_code=400, detail="No files were uploaded.")

        ensure_catalog_directories()
        raw_root = Path(UPLOAD_RAW_DIR)
        raw_root.mkdir(parents=True, exist_ok=True)

        batch_id = str(uuid.uuid4())
        clean_batch_name = (batch_name or "").strip() or _default_batch_name()
        batch_root = raw_root / batch_id
        batch_root.mkdir(parents=True, exist_ok=True)
        info(
            f"[upload] Starting batch {batch_id} '{clean_batch_name}' "
            f"with {len(files)} incoming files"
        )

        file_records: list[dict[str, Any]] = []
        total_bytes = 0

        for idx, upload in enumerate(files):
            raw_name = upload.filename or f"file-{idx}"
            try:
                rel_path = _safe_rel_path(raw_name)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if is_ignored_upload_path(rel_path):
                await upload.close()
                info(
                    f"[upload] Batch {batch_id}: skipped ignored file {idx + 1}/{len(files)} "
                    f"'{rel_path}'"
                )
                continue

            target = batch_root / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)

            hasher = hashlib.sha256()
            size = 0
            with target.open("wb") as f:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    size += len(chunk)
                    hasher.update(chunk)
            await upload.close()

            total_bytes += size
            info(
                f"[upload] Batch {batch_id}: stored file {idx + 1}/{len(files)} "
                f"'{rel_path}' ({size} bytes)"
            )
            file_records.append(
                {
                    "id": str(uuid.uuid4()),
                    "rel_path": rel_path,
                    "abs_path": str(target.resolve()),
                    "ext": _file_ext(rel_path),
                    "size": size,
                    "sha256": hasher.hexdigest(),
                }
            )

        if not file_records:
            raise HTTPException(
                status_code=400,
                detail="No supported files found in upload (only ignored/system files).",
            )

        catalog = get_catalog()
        catalog.create_batch(
            batch_id=batch_id,
            name=clean_batch_name,
            root_dir=str(batch_root.resolve()),
            file_count=len(file_records),
            total_bytes=total_bytes,
            status="uploaded",
            session_id=x_session_id,
        )
        catalog.add_batch_files(batch_id, file_records)

        info(f"[upload] Batch {batch_id}: starting procedural scan for {len(file_records)} files")
        candidates = scan_candidates(file_records)
        catalog.replace_candidates(batch_id, candidates)
        catalog.update_batch_status(batch_id, "scanned")
        info(f"[upload] Batch {batch_id}: scan completed, detected {len(candidates)} candidates")

        # Run deterministic quality checks immediately (instant, no AI)
        existing_datasets = _collect_existing_datasets(catalog)
        verdicts = check_all_candidates(candidates, existing_datasets)
        name_to_id: dict[str, str] = {c["name"]: c["id"] for c in candidates}
        for v in verdicts:
            cid = name_to_id.get(v["name"])
            if cid:
                catalog.update_candidate_verdict(
                    candidate_id=cid,
                    verdict=v["verdict"],
                    issues=v["issues"],
                    summary=v["summary"],
                    thumbnail_path=None,
                )
        # Re-fetch candidates so response includes verdicts
        candidates = catalog.list_candidates(batch_id)
        info(f"[upload] Batch {batch_id}: deterministic checks complete")

        return {
            "batch_id": batch_id,
            "batch_name": clean_batch_name,
            "file_count": len(file_records),
            "total_bytes": total_bytes,
            "candidates": candidates,
        }

    @router.get("/batches/{batch_id}")
    async def get_batch(batch_id: str):
        catalog = get_catalog()
        batch = catalog.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found.")
        candidates = catalog.list_candidates(batch_id)
        return {
            "batch": batch,
            "candidates": candidates,
        }

    @router.post("/batches/{batch_id}/ingest")
    async def ingest_batch(batch_id: str, request: IngestRequest | None = None):
        catalog = get_catalog()
        batch = catalog.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found.")

        candidates = catalog.list_candidates(batch_id)
        if not candidates:
            raise HTTPException(status_code=400, detail="No candidates found for batch.")

        override_map: dict[str, CandidateOverride] = {}
        if request and request.candidates:
            override_map = {o.candidate_id: o for o in request.candidates}

        ingested = []
        failed = []

        datasets_root = Path(CATALOG_DATASETS_DIR)
        datasets_root.mkdir(parents=True, exist_ok=True)

        for candidate in candidates:
            override = override_map.get(candidate["id"])
            if override and not override.keep:
                continue

            try:
                result = ingest_candidate(
                    catalog=catalog,
                    batch=batch,
                    candidate=candidate,
                    datasets_root=datasets_root,
                    override_name=override.dataset_name if override else None,
                    override_role=override.role if override else None,
                    override_crs=override.crs if override else None,
                )
                ingested.append(result)
            except Exception as e:
                failed.append(
                    {
                        "candidate_id": candidate["id"],
                        "name": candidate.get("name"),
                        "error": str(e),
                    }
                )

        catalog.update_batch_status(
            batch_id,
            "ingested" if not failed else "ingested_with_errors",
        )

        combined_bounds = _compute_combined_bounds(ingested)

        return {
            "batch_id": batch_id,
            "batch_name": batch.get("name", ""),
            "ingested_count": len(ingested),
            "failed_count": len(failed),
            "ingested": ingested,
            "failed": failed,
            "combined_bounds": combined_bounds,
        }

    @router.get("/datasets")
    async def list_uploaded_datasets():
        datasets = get_catalog().list_uploaded_datasets(latest_only=True)
        return {"datasets": datasets}

    @router.post("/batches/{batch_id}/quality-check")
    async def trigger_quality_check(batch_id: str):
        catalog = get_catalog()
        batch = catalog.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found.")

        result = run_quality_gate(catalog, batch_id)
        if result is None:
            raise HTTPException(status_code=502, detail="Quality check failed")

        return {"batch_id": batch_id, "status": "completed", "result": result}

    @router.get("/batches/{batch_id}/quality-check")
    async def get_quality_check(batch_id: str):
        catalog = get_catalog()
        batch = catalog.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found.")

        candidates = catalog.list_candidates(batch_id)
        return {
            "batch_id": batch_id,
            "status": batch["quality_check_status"],
            "candidates": candidates,
        }

    @router.get("/ai-available")
    async def ai_available():
        """Check whether AI enrichment (Claude CLI + dtcc-agent MCP) is available."""
        from .claude_runner import MCP_CONFIG_PATH

        has_claude = shutil.which("claude") is not None
        has_mcp = MCP_CONFIG_PATH.exists()
        available = has_claude and has_mcp
        reason = ""
        if not has_claude:
            reason = "Claude CLI not found on PATH."
        elif not has_mcp:
            reason = "dtcc-agent MCP config (.mcp.json) not found."
        return {"available": available, "reason": reason}

    @router.post("/catalog/review")
    async def trigger_catalog_review():
        from .catalog_review import run_catalog_review

        catalog = get_catalog()
        result = run_catalog_review(catalog)
        if result is None:
            raise HTTPException(status_code=502, detail="Catalog review failed")
        return {"status": "completed", "result": result}

    return router
