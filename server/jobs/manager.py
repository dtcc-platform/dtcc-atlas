"""Job manager for handling async dataset processing."""

import asyncio
import threading
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from typing import Dict, Optional, List, Any
from collections import deque

from .models import Job, JobStatus
from .storage import JobStorage
from .worker import process_dataset_job


class JobManager:
    """
    Manages the job queue, worker pool, and SSE subscriptions.

    This class is thread-safe and designed to work with FastAPI's async handlers.
    Jobs are properly tracked as QUEUED until a worker slot is available,
    then transition to PROCESSING when actually running.
    """

    def __init__(
        self,
        max_workers: int = 4,
        storage: Optional[JobStorage] = None,
        job_timeout: float = 30.0,
    ):
        """
        Initialize the job manager.

        Args:
            max_workers: Maximum number of parallel worker processes.
            storage: JobStorage instance. Creates new one if not provided.
            job_timeout: Maximum time in seconds for a job to complete.
        """
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._executor = ProcessPoolExecutor(max_workers=max_workers)
        self._max_workers = max_workers
        self._job_timeout = job_timeout
        self._active_count = 0
        self._pending_queue: deque[str] = deque()
        self._storage = storage or JobStorage()
        self._subscribers: List[asyncio.Queue] = []
        self._subscriber_lock = threading.Lock()
        self._running = True

        # Cleanup scheduler - runs every 10 minutes
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()

    @property
    def storage(self) -> JobStorage:
        return self._storage

    async def submit(
        self,
        dataset: str,
        params: Dict[str, Any],
        filename: Optional[str] = None,
    ) -> Job:
        """
        Submit a new job for processing.

        Args:
            dataset: Dataset name.
            params: Dataset parameters including bounds.
            filename: Optional custom filename.

        Returns:
            The created Job instance.
        """
        job = Job(
            dataset=dataset,
            params=params,
            filename=filename or dataset,
        )

        with self._lock:
            self._jobs[job.id] = job
            self._pending_queue.append(job.id)

        # Broadcast job creation (status is QUEUED)
        self._broadcast_event("job_update", job.to_dict())

        # Try to start processing if workers available (non-blocking)
        asyncio.create_task(self._try_process_next())

        return job

    async def _try_process_next(self) -> None:
        """Try to start processing the next queued job if a worker is available."""
        job_to_process: Optional[Job] = None

        with self._lock:
            if self._active_count >= self._max_workers:
                return
            if not self._pending_queue:
                return

            job_id = self._pending_queue.popleft()
            job = self._jobs.get(job_id)

            if job and job.status == JobStatus.QUEUED:
                job.status = JobStatus.PROCESSING
                self._active_count += 1
                job_to_process = job

        if job_to_process:
            self._broadcast_event("job_update", job_to_process.to_dict())
            await self._execute_job(job_to_process)

    async def _execute_job(self, job: Job) -> None:
        """Execute a job in the process pool with timeout."""
        try:
            # Run in process pool with timeout
            loop = asyncio.get_event_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    self._executor,
                    process_dataset_job,
                    job.dataset,
                    job.params,
                ),
                timeout=self._job_timeout,
            )

            data, extension, content_type = result

            # Save result to storage
            result_path = self._storage.save_result(job.id, data, extension)

            # Update job with result
            with self._lock:
                job.status = JobStatus.COMPLETE
                job.result_path = result_path
                job.content_type = content_type
                job.filename = f"{job.filename}.{extension}"
                job.completed_at = datetime.now()
                self._active_count -= 1

            self._broadcast_event("job_complete", {
                **job.to_dict(),
                "download_url": f"/api/v1/jobs/{job.id}/download",
            })

        except asyncio.TimeoutError:
            with self._lock:
                job.status = JobStatus.FAILED
                job.error = f"Job timed out after {self._job_timeout} seconds"
                job.completed_at = datetime.now()
                self._active_count -= 1

            self._broadcast_event("job_failed", job.to_dict())

        except Exception as e:
            with self._lock:
                job.status = JobStatus.FAILED
                job.error = str(e)
                job.completed_at = datetime.now()
                self._active_count -= 1

            self._broadcast_event("job_failed", job.to_dict())

        # Try to process next queued job
        await self._try_process_next()

    def get_status(self, job_id: str) -> Optional[Job]:
        """Get job status by ID."""
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self, limit: int = 50) -> List[Job]:
        """List recent jobs."""
        with self._lock:
            jobs = list(self._jobs.values())
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            return jobs[:limit]

    def get_queue_position(self, job_id: str) -> Optional[int]:
        """Get position in queue (1-indexed) or None if not queued."""
        with self._lock:
            try:
                return list(self._pending_queue).index(job_id) + 1
            except ValueError:
                return None

    def subscribe(self) -> asyncio.Queue:
        """
        Subscribe to job events.

        Returns:
            An asyncio.Queue that will receive job events.
        """
        q: asyncio.Queue = asyncio.Queue()
        with self._subscriber_lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a subscriber."""
        with self._subscriber_lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def _broadcast_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcast an event to all subscribers."""
        event = {"type": event_type, "data": data}

        with self._subscriber_lock:
            for q in self._subscribers:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    pass  # Skip if queue is full

    def _cleanup_loop(self) -> None:
        """Periodic cleanup of old job files."""
        import time
        while self._running:
            time.sleep(600)  # Every 10 minutes
            try:
                removed = self._storage.cleanup_old()
                if removed > 0:
                    print(f"Cleaned up {removed} old job files")
            except Exception as e:
                print(f"Error during cleanup: {e}")

    def shutdown(self) -> None:
        """Shutdown the job manager and cleanup resources."""
        self._running = False
        self._executor.shutdown(wait=False)
        self._storage.cleanup_all()
