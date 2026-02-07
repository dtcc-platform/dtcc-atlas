"""FastAPI routes for job management."""

import asyncio
import json
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from .manager import JobManager


class JobSubmitRequest(BaseModel):
    """Request model for job submission."""
    dataset: str
    bounds: list[float]
    parameters: Dict[str, Any]
    filename: Optional[str] = None


class JobSubmitResponse(BaseModel):
    """Response model for job submission."""
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Response model for job status."""
    id: str
    dataset: str
    status: str
    filename: Optional[str]
    error: Optional[str]
    progress: Optional[Dict[str, Any]] = None
    created_at: str
    completed_at: Optional[str]
    download_url: Optional[str] = None


def create_jobs_router(job_manager: JobManager) -> APIRouter:
    """
    Create the jobs API router.

    Args:
        job_manager: The JobManager instance to use.

    Returns:
        Configured APIRouter.
    """
    router = APIRouter(prefix="/jobs", tags=["jobs"])

    @router.post("/submit", response_model=JobSubmitResponse)
    async def submit_job(request: JobSubmitRequest):
        """
        Submit a new dataset download job.

        Returns immediately with job ID while processing happens in background.
        """
        # Merge bounds with parameters
        params = {"bounds": request.bounds, **request.parameters}

        job = await job_manager.submit(
            dataset=request.dataset,
            params=params,
            filename=request.filename,
        )

        return JobSubmitResponse(
            job_id=job.id,
            status=job.status.value,
        )

    @router.get("/{job_id}/status", response_model=JobStatusResponse)
    async def get_job_status(job_id: str):
        """
        Get the status of a specific job.

        This is a fallback for clients that don't support SSE.
        """
        job = job_manager.get_status(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        response = JobStatusResponse(
            id=job.id,
            dataset=job.dataset,
            status=job.status.value,
            filename=job.filename,
            error=job.error,
            progress=job.progress,
            created_at=job.created_at.isoformat(),
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
        )

        if job.status.value == "complete":
            response.download_url = f"/api/v1/jobs/{job.id}/download"

        return response

    @router.post("/{job_id}/cancel")
    async def cancel_job(job_id: str):
        """
        Cancel a running or queued job.

        Returns 404 if job not found, 400 if already complete.
        """
        success = await job_manager.cancel_job(job_id)
        if not success:
            job = job_manager.get_status(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel job with status: {job.status.value}"
            )
        return {"success": True, "message": "Job cancelled"}

    @router.get("/{job_id}/download")
    async def download_job_result(job_id: str):
        """
        Download the result of a completed job.

        Returns 404 if job not found or not complete.
        """
        job = job_manager.get_status(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status.value != "complete":
            raise HTTPException(
                status_code=400,
                detail=f"Job is not complete. Current status: {job.status.value}"
            )

        if not job.result_path:
            raise HTTPException(status_code=404, detail="Job result not found")

        return FileResponse(
            path=job.result_path,
            filename=job.filename,
            media_type=job.content_type,
            headers={"Content-Disposition": f'attachment; filename="{job.filename}"'},
        )

    @router.get("/events")
    async def job_events(request: Request):
        """
        Server-Sent Events endpoint for real-time job updates.

        Clients should connect to this endpoint to receive job status updates.
        Events:
        - job_update: Job status changed
        - job_complete: Job finished successfully
        - job_failed: Job failed with error
        """
        async def event_generator():
            # Subscribe to job events
            queue = job_manager.subscribe()

            try:
                # Send initial connection event
                yield f"event: connected\ndata: {json.dumps({'message': 'Connected to job events'})}\n\n"

                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break

                    try:
                        # Wait for event with timeout
                        event = await asyncio.wait_for(queue.get(), timeout=30.0)
                        event_type = event["type"]
                        event_data = json.dumps(event["data"])
                        yield f"event: {event_type}\ndata: {event_data}\n\n"
                    except asyncio.TimeoutError:
                        # Send keepalive comment
                        yield ": keepalive\n\n"

            finally:
                job_manager.unsubscribe(queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable buffering for nginx
            },
        )

    @router.get("/list")
    async def list_jobs(limit: int = 50):
        """
        List recent jobs.

        This can be used to restore job list after page refresh.
        """
        jobs = job_manager.list_jobs(limit=limit)
        return {
            "jobs": [
                {
                    **job.to_dict(),
                    "download_url": f"/api/v1/jobs/{job.id}/download"
                    if job.status.value == "complete"
                    else None,
                }
                for job in jobs
            ]
        }

    return router
