"""FastAPI routes for UE artifact management."""

from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .manager import ArtifactManager


class ArtifactSubmitRequest(BaseModel):
    """Request model for artifact submission."""
    dataset: str
    bounds: list[float]
    parameters: Dict[str, Any] = {}
    filename: Optional[str] = None


class ArtifactSubmitResponse(BaseModel):
    """Response model for artifact submission."""
    artifact_id: str
    status: str


class ArtifactStatusResponse(BaseModel):
    """Response model for artifact status."""
    artifact_id: str
    dataset: str
    status: str
    format: Optional[str]
    content_type: str
    bounds: List[float]
    download_url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    filename: Optional[str] = None
    error: Optional[str] = None
    job_id: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class ArtifactSummary(BaseModel):
    """Summary model for artifact list responses."""
    artifact_id: str
    dataset: str
    status: str
    format: Optional[str]
    bounds: List[float]
    created_at: str


def create_ue_router(artifact_manager: ArtifactManager) -> APIRouter:
    """
    Create the UE artifacts API router.

    Args:
        artifact_manager: The ArtifactManager instance to use.

    Returns:
        Configured APIRouter.
    """
    router = APIRouter(prefix="/ue/artifacts", tags=["ue-artifacts"])

    @router.post("", status_code=202, response_model=ArtifactSubmitResponse)
    async def submit_artifact(request: ArtifactSubmitRequest):
        """
        Submit a new artifact generation request.

        Returns immediately with artifact ID while processing happens in background.
        """
        artifact = await artifact_manager.submit(
            dataset=request.dataset,
            bounds=request.bounds,
            parameters=request.parameters,
            filename=request.filename,
        )

        return ArtifactSubmitResponse(
            artifact_id=artifact.id,
            status=artifact.status.value,
        )

    @router.get("/{artifact_id}", response_model=ArtifactStatusResponse)
    async def get_artifact_status(artifact_id: str):
        """
        Get the status and metadata of a specific artifact.
        """
        artifact = artifact_manager.get_artifact(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        return ArtifactStatusResponse(
            artifact_id=artifact.id,
            dataset=artifact.dataset,
            status=artifact.status.value,
            format=artifact.format,
            content_type=artifact.content_type,
            bounds=artifact.bounds,
            download_url=artifact.download_url,
            file_size_bytes=artifact.file_size_bytes,
            filename=artifact.filename,
            error=artifact.error,
            job_id=artifact.job_id,
            created_at=artifact.created_at.isoformat(),
            completed_at=artifact.completed_at.isoformat() if artifact.completed_at else None,
        )

    @router.get("/{artifact_id}/download")
    async def download_artifact(artifact_id: str):
        """
        Download the result file of a completed artifact.

        Returns 404 if artifact doesn't exist or file has been cleaned up.
        Returns 409 if artifact is not yet complete.
        """
        artifact = artifact_manager.get_artifact(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        if artifact.status.value != "complete":
            raise HTTPException(
                status_code=409,
                detail=f"Artifact is not complete. Current status: {artifact.status.value}",
            )

        if not artifact.result_path:
            raise HTTPException(status_code=404, detail="Artifact file not found")

        # Construct download filename
        download_filename = artifact.filename or artifact.dataset
        if artifact.format:
            fmt_ext = artifact.format
            if fmt_ext == "cityjson":
                fmt_ext = "city.json"
            download_filename = f"{download_filename}.{fmt_ext}"

        return FileResponse(
            path=artifact.result_path,
            filename=download_filename,
            media_type=artifact.content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{download_filename}"'
            },
        )

    @router.get("", response_model=Dict[str, list])
    async def list_artifacts(limit: int = 50):
        """
        List active artifacts.
        """
        artifacts = artifact_manager.list_artifacts(limit=limit)
        return {
            "artifacts": [a.to_summary_dict() for a in artifacts]
        }

    return router
