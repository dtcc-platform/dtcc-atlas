"""Artifact manager for UE dataset delivery pipeline."""

import asyncio
import threading
import time
from datetime import datetime
from typing import Dict, Optional, List, Any

from .models import Artifact, ArtifactStatus
from .storage import ArtifactStorage
from server.jobs.manager import JobManager
from server.jobs.models import JobStatus


class ArtifactManager:
    """
    Manages UE artifact lifecycle.

    Delegates dataset generation to the existing JobManager and listens
    for job events to update artifact state. When a tracked job completes,
    the result is copied from temporary job storage to persistent artifact
    storage and an artifact_ready SSE event is broadcast.
    """

    def __init__(
        self,
        job_manager: JobManager,
        storage: ArtifactStorage,
    ):
        """
        Initialize the artifact manager.

        Args:
            job_manager: The shared JobManager for dataset generation.
            storage: ArtifactStorage instance for persistent file storage.
        """
        self._job_manager = job_manager
        self._storage = storage
        self._artifacts: Dict[str, Artifact] = {}
        self._lock = threading.Lock()

        # Mapping from job_id -> artifact_id for event routing
        self._job_to_artifact: Dict[str, str] = {}

        self._running = True
        self._event_queue: Optional[asyncio.Queue] = None
        self._listener_task: Optional[asyncio.Task] = None

        # Cleanup scheduler - runs every 10 minutes
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop, daemon=True
        )
        self._cleanup_thread.start()

    @property
    def storage(self) -> ArtifactStorage:
        return self._storage

    async def start(self) -> None:
        """Start the async event listener.

        Must be called from within an async context (e.g. the FastAPI lifespan).
        Subscribes to JobManager events and begins routing them to artifacts.
        """
        self._event_queue = self._job_manager.subscribe()
        self._listener_task = asyncio.create_task(self._event_listener())

    async def submit(
        self,
        dataset: str,
        bounds: List[float],
        parameters: Dict[str, Any],
        filename: Optional[str] = None,
    ) -> Artifact:
        """
        Submit a new artifact generation request.

        Creates an Artifact, delegates to JobManager, and tracks the mapping.

        Args:
            dataset: Dataset name.
            bounds: Bounding box [west, south, east, north].
            parameters: Dataset-specific parameters.
            filename: Optional base filename.

        Returns:
            The created Artifact instance.
        """
        artifact = Artifact(
            dataset=dataset,
            bounds=bounds,
            params=parameters,
            format=parameters.get("format"),
            filename=filename or dataset,
        )

        # Tag the job params so the frontend can distinguish UE artifact jobs
        job_params = {"bounds": bounds, "__ue_artifact": True, **parameters}

        job = await self._job_manager.submit(
            dataset=dataset,
            params=job_params,
            filename=filename,
        )

        artifact.job_id = job.id

        with self._lock:
            self._artifacts[artifact.id] = artifact
            self._job_to_artifact[job.id] = artifact.id

        return artifact

    def get_artifact(self, artifact_id: str) -> Optional[Artifact]:
        """Get artifact by ID."""
        with self._lock:
            return self._artifacts.get(artifact_id)

    def list_artifacts(self, limit: int = 50) -> List[Artifact]:
        """List recent artifacts."""
        with self._lock:
            artifacts = list(self._artifacts.values())
            artifacts.sort(key=lambda a: a.created_at, reverse=True)
            return artifacts[:limit]

    async def _event_listener(self) -> None:
        """Listen for JobManager events and route them to artifact updates."""
        while self._running:
            try:
                event = await asyncio.wait_for(
                    self._event_queue.get(), timeout=5.0
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            try:
                self._handle_event(event)
            except Exception as e:
                print(f"[artifact manager] Error handling event: {e}")

    def _handle_event(self, event: Dict[str, Any]) -> None:
        """Process a single JobManager event."""
        event_type = event.get("type", "")
        data = event.get("data", {})
        job_id = data.get("id")

        if not job_id:
            return

        with self._lock:
            artifact_id = self._job_to_artifact.get(job_id)
            if not artifact_id:
                return  # Not a tracked artifact job
            artifact = self._artifacts.get(artifact_id)
            if not artifact:
                return

        if event_type == "job_update":
            self._handle_job_update(artifact, data)
        elif event_type == "job_complete":
            self._handle_job_complete(artifact, data)
        elif event_type == "job_failed":
            self._handle_job_failed(artifact, data)

    def _handle_job_update(self, artifact: Artifact, data: Dict[str, Any]) -> None:
        """Handle job_update event — update artifact status to processing."""
        status_str = data.get("status", "")
        if status_str == "processing":
            with self._lock:
                artifact.status = ArtifactStatus.PROCESSING

    def _handle_job_complete(self, artifact: Artifact, data: Dict[str, Any]) -> None:
        """Handle job_complete event — copy result to artifact storage and broadcast."""
        job_id = artifact.job_id
        if not job_id:
            return

        # Read result from temporary job storage
        result = self._job_manager.storage.get_result(job_id)
        if not result:
            # Fall back: try to get path from the job object
            with self._lock:
                artifact.status = ArtifactStatus.FAILED
                artifact.error = "Job completed but result not found in storage"
                artifact.completed_at = datetime.now()

            self._job_manager._broadcast_event(
                "artifact_failed", artifact.to_dict()
            )
            return

        file_data, source_path = result

        # Determine file extension from the job result
        extension = "bin"
        if source_path:
            parts = source_path.rsplit(".", 1)
            if len(parts) > 1:
                extension = parts[1]

        # Save to persistent artifact storage
        try:
            result_path = self._storage.save_result(
                artifact.id, file_data, extension
            )
        except Exception as e:
            with self._lock:
                artifact.status = ArtifactStatus.FAILED
                artifact.error = f"Failed to save artifact: {e}"
                artifact.completed_at = datetime.now()

            self._job_manager._broadcast_event(
                "artifact_failed", artifact.to_dict()
            )
            return

        file_size = self._storage.get_file_size(artifact.id)

        # Determine content type from the job data
        content_type = data.get("content_type", "application/octet-stream")

        # Build the content type map matching the existing codebase
        fmt = artifact.format
        if fmt and content_type == "application/octet-stream":
            content_type_map = {
                "tif": "image/tiff",
                "obj": "model/obj",
                "stl": "model/stl",
                "copc": "application/octet-stream",
                "las": "application/octet-stream",
                "laz": "application/octet-stream",
                "cityjson": "application/json",
                "json": "application/json",
                "geojson": "application/geo+json",
            }
            content_type = content_type_map.get(fmt, content_type)

        with self._lock:
            artifact.status = ArtifactStatus.COMPLETE
            artifact.result_path = result_path
            artifact.content_type = content_type
            artifact.file_size_bytes = file_size
            artifact.download_url = (
                f"/api/v1/ue/artifacts/{artifact.id}/download"
            )
            artifact.completed_at = datetime.now()

        self._job_manager._broadcast_event(
            "artifact_ready", artifact.to_dict()
        )

    def _handle_job_failed(self, artifact: Artifact, data: Dict[str, Any]) -> None:
        """Handle job_failed event — update artifact and broadcast failure."""
        with self._lock:
            artifact.status = ArtifactStatus.FAILED
            artifact.error = data.get("error", "Unknown error")
            artifact.completed_at = datetime.now()

        self._job_manager._broadcast_event(
            "artifact_failed", artifact.to_dict()
        )

    def _cleanup_loop(self) -> None:
        """Periodic cleanup of old artifact files."""
        while self._running:
            time.sleep(600)  # Every 10 minutes
            try:
                removed = self._storage.cleanup_old()
                if removed > 0:
                    print(f"Cleaned up {removed} old artifact files")

                    # Also remove the in-memory artifact records for cleaned-up files
                    with self._lock:
                        expired = [
                            aid
                            for aid, artifact in self._artifacts.items()
                            if self._storage.get_file_path(aid) is None
                            and artifact.status == ArtifactStatus.COMPLETE
                        ]
                        for aid in expired:
                            artifact = self._artifacts.pop(aid, None)
                            if artifact and artifact.job_id:
                                self._job_to_artifact.pop(artifact.job_id, None)
            except Exception as e:
                print(f"Error during artifact cleanup: {e}")

    def shutdown(self) -> None:
        """Shutdown the artifact manager and cleanup resources."""
        self._running = False

        # Cancel the listener task
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()

        # Unsubscribe from job events
        if self._event_queue:
            self._job_manager.unsubscribe(self._event_queue)

        self._storage.cleanup_all()
