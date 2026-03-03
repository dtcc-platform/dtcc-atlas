"""Job manager for handling async dataset processing."""

import asyncio
import multiprocessing
import os
import queue
import threading
import time
from datetime import datetime
from typing import Dict, Optional, List, Any
from collections import deque

from .models import Job, JobStatus
from .storage import JobStorage
from .worker import process_dataset_job


class JobManager:
    """
    Manages the job queue, worker pool, and SSE subscriptions.

    Uses multiprocessing.Process directly instead of ProcessPoolExecutor
    to allow for reliable job cancellation/termination.
    """
    _PROGRESS_EVENT_MIN_INTERVAL = 0.25
    _PROGRESS_EVENT_MIN_DELTA = 1.0

    def __init__(
        self,
        max_workers: int = 4,
        storage: Optional[JobStorage] = None,
        job_timeout: float = 120.0,
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
        self._max_workers = max_workers
        self._job_timeout = job_timeout
        self._active_count = 0
        self._pending_queue: deque[str] = deque()
        self._storage = storage or JobStorage()
        self._subscribers: List[asyncio.Queue] = []
        self._subscriber_lock = threading.Lock()
        self._debug_subscribers = (
            os.getenv("JOB_DEBUG_SSE_SUBSCRIBERS", "").strip().lower()
            in {"1", "true", "yes", "on"}
        )
        self._running = True

        # Track running processes for cancellation
        self._processes: Dict[str, multiprocessing.Process] = {}
        self._result_queues: Dict[str, multiprocessing.Queue] = {}

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

    async def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a running or queued job.

        Args:
            job_id: The job ID to cancel.

        Returns:
            True if job was cancelled, False if not found or already complete.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status in (JobStatus.COMPLETE, JobStatus.FAILED):
                return False

            # If queued, just remove from queue
            if job.status == JobStatus.QUEUED:
                try:
                    # Remove from pending queue
                    self._pending_queue = deque(
                        jid for jid in self._pending_queue if jid != job_id
                    )
                    job.status = JobStatus.FAILED
                    job.error = "Cancelled by user"
                    job.progress = None
                    job.completed_at = datetime.now()
                except ValueError:
                    pass

            # If processing, terminate the process
            elif job.status == JobStatus.PROCESSING:
                process = self._processes.get(job_id)
                if process and process.is_alive():
                    process.terminate()
                    process.join(timeout=2)
                    if process.is_alive():
                        process.kill()  # Force kill if terminate didn't work
                        process.join(timeout=1)

                # Cleanup
                if job_id in self._processes:
                    del self._processes[job_id]
                if job_id in self._result_queues:
                    del self._result_queues[job_id]

                job.status = JobStatus.FAILED
                job.error = "Cancelled by user"
                job.progress = None
                job.completed_at = datetime.now()
                self._active_count -= 1

        self._broadcast_event("job_failed", job.to_dict())

        # Try to process next queued job
        asyncio.create_task(self._try_process_next())

        return True

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
                job.progress = {
                    "percent": 0.0,
                    "phase": "queued",
                    "message": "Starting job...",
                    "eta_formatted": None,
                    "phases": None,
                }
                self._active_count += 1
                job_to_process = job

        if job_to_process:
            self._broadcast_event("job_update", job_to_process.to_dict())
            await self._execute_job(job_to_process)

    async def _execute_job(self, job: Job) -> None:
        """Execute a job in a separate process with timeout and cancellation support."""
        result_queue: multiprocessing.Queue = multiprocessing.Queue()

        # Create and start the process
        process = multiprocessing.Process(
            target=_worker_wrapper,
            args=(result_queue, job.dataset, job.params),
            daemon=True,
        )

        with self._lock:
            self._processes[job.id] = process
            self._result_queues[job.id] = result_queue

        process.start()

        try:
            started_at = time.monotonic()
            last_progress_emit_at = 0.0
            last_progress_percent = -1.0
            result: Any = None
            worker_error: Optional[str] = None
            timed_out = False
            cancelled = False
            done = False

            while not done:
                with self._lock:
                    if job.status == JobStatus.FAILED:
                        cancelled = True
                        break

                while True:
                    try:
                        message = result_queue.get_nowait()
                    except queue.Empty:
                        break

                    if isinstance(message, dict):
                        message_type = message.get("type")
                        if message_type == "progress":
                            progress = _normalize_progress_state(message.get("data"))
                            if progress is None:
                                continue

                            percent = progress["percent"]
                            now = time.monotonic()
                            should_emit = (
                                percent >= 100.0
                                or last_progress_emit_at == 0.0
                                or now - last_progress_emit_at >= self._PROGRESS_EVENT_MIN_INTERVAL
                                or abs(percent - last_progress_percent) >= self._PROGRESS_EVENT_MIN_DELTA
                            )

                            with self._lock:
                                if job.status != JobStatus.PROCESSING:
                                    continue
                                job.progress = progress

                            if should_emit:
                                self._broadcast_event("job_update", job.to_dict())
                                last_progress_emit_at = now
                                last_progress_percent = percent
                            continue

                        if message_type == "result":
                            result = message.get("data")
                            done = True
                            break

                        if message_type == "error":
                            worker_error = str(message.get("error") or "Worker failed")
                            done = True
                            break

                    # Backward compatibility for any legacy worker payload format.
                    if isinstance(message, Exception):
                        worker_error = str(message)
                    else:
                        result = message
                    done = True
                    break

                if done:
                    break

                if time.monotonic() - started_at > self._job_timeout:
                    timed_out = True
                    break

                if not process.is_alive():
                    drained_result = False
                    drain_deadline = time.monotonic() + 0.5
                    while time.monotonic() < drain_deadline:
                        try:
                            message = result_queue.get(timeout=0.1)
                        except Exception:
                            break

                        if isinstance(message, dict):
                            message_type = message.get("type")
                            if message_type == "progress":
                                progress = _normalize_progress_state(message.get("data"))
                                if progress is not None:
                                    with self._lock:
                                        if job.status == JobStatus.PROCESSING:
                                            job.progress = progress
                                continue
                            if message_type == "result":
                                result = message.get("data")
                                drained_result = True
                                break
                            if message_type == "error":
                                worker_error = str(message.get("error") or "Worker failed")
                                drained_result = True
                                break

                        if isinstance(message, Exception):
                            worker_error = str(message)
                        else:
                            result = message
                        drained_result = True
                        break

                    if not drained_result:
                        worker_error = "Worker process exited unexpectedly without a result"
                        print(f"[job manager] Job {job.id}: {worker_error}")
                    done = True
                    break

                await asyncio.sleep(0.05)

            # Check if job was cancelled while executing.
            with self._lock:
                if job.status == JobStatus.FAILED:
                    cancelled = True

            if cancelled:
                pass
            elif timed_out:
                # Timeout - kill the process.
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=2)
                    if process.is_alive():
                        process.kill()
                        process.join(timeout=1)

                with self._lock:
                    if job.status == JobStatus.FAILED:
                        cancelled = True
                    else:
                        job.status = JobStatus.FAILED
                        job.error = f"Job timed out after {self._job_timeout} seconds"
                        job.progress = None
                        job.completed_at = datetime.now()
                        self._active_count -= 1
                        print(f"[job manager] Job {job.id} failed: {job.error}")

                if not cancelled:
                    self._broadcast_event("job_failed", job.to_dict())

            elif worker_error is not None:
                with self._lock:
                    if job.status == JobStatus.FAILED:
                        cancelled = True
                    else:
                        job.status = JobStatus.FAILED
                        job.error = worker_error
                        job.progress = None
                        job.completed_at = datetime.now()
                        self._active_count -= 1
                        print(f"[job manager] Job {job.id} failed: {worker_error}")

                if not cancelled:
                    self._broadcast_event("job_failed", job.to_dict())

            elif result is None:
                with self._lock:
                    if job.status == JobStatus.FAILED:
                        cancelled = True
                    else:
                        job.status = JobStatus.FAILED
                        job.error = "Worker returned no result"
                        job.progress = None
                        job.completed_at = datetime.now()
                        self._active_count -= 1
                        print(f"[job manager] Job {job.id} failed: Worker returned no result")

                if not cancelled:
                    self._broadcast_event("job_failed", job.to_dict())

            else:
                # Success.
                data, extension, content_type = result

                # Save result to storage.
                result_path = self._storage.save_result(job.id, data, extension)

                with self._lock:
                    if job.status == JobStatus.FAILED:
                        cancelled = True
                    else:
                        job.status = JobStatus.COMPLETE
                        job.result_path = result_path
                        job.content_type = content_type
                        job.filename = f"{job.filename}.{extension}"
                        job.progress = {
                            "percent": 100.0,
                            "phase": "complete",
                            "message": "Job complete",
                            "eta_formatted": None,
                            "phases": None,
                        }
                        job.completed_at = datetime.now()
                        self._active_count -= 1

                if not cancelled:
                    self._broadcast_event("job_complete", {
                        **job.to_dict(),
                        "download_url": f"/api/v1/jobs/{job.id}/download",
                    })

        except Exception as e:
            import traceback
            print(f"[job manager] Job {job.id} unexpected error:\n{traceback.format_exc()}")
            should_broadcast = False
            with self._lock:
                if job.status == JobStatus.FAILED:
                    pass
                else:
                    job.status = JobStatus.FAILED
                    job.error = str(e)
                    job.progress = None
                    job.completed_at = datetime.now()
                    self._active_count -= 1
                    should_broadcast = True

            if should_broadcast:
                self._broadcast_event("job_failed", job.to_dict())

        finally:
            # Cleanup
            with self._lock:
                if job.id in self._processes:
                    del self._processes[job.id]
                if job.id in self._result_queues:
                    del self._result_queues[job.id]

            # Ensure process is terminated
            if process.is_alive():
                process.terminate()
                process.join(timeout=1)

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
            if self._debug_subscribers:
                print(f"[job manager] SSE subscriber connected ({len(self._subscribers)} total)")
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a subscriber."""
        with self._subscriber_lock:
            if q in self._subscribers:
                self._subscribers.remove(q)
                if self._debug_subscribers:
                    print(
                        f"[job manager] SSE subscriber disconnected "
                        f"({len(self._subscribers)} total)"
                    )

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

        # Terminate all running processes
        with self._lock:
            for job_id, process in list(self._processes.items()):
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=2)
                    if process.is_alive():
                        process.kill()

        self._storage.cleanup_all()


def _worker_wrapper(result_queue: multiprocessing.Queue, dataset: str, params: Dict[str, Any]) -> None:
    """Wrapper function that runs in a separate process and puts typed messages in queue."""
    def on_progress(state: Dict[str, Any]) -> None:
        result_queue.put({"type": "progress", "data": state})

    try:
        result = process_dataset_job(dataset, params, on_progress=on_progress)
        result_queue.put({"type": "result", "data": result})
    except Exception as e:
        import traceback
        print(f"[job worker] Unhandled error:\n{traceback.format_exc()}")
        result_queue.put({"type": "error", "error": str(e)})


def _normalize_progress_state(state: Any) -> Optional[Dict[str, Any]]:
    """Normalize progress payload shape for API consumers."""
    if not isinstance(state, dict):
        return None

    try:
        percent = float(state.get("percent", 0.0))
    except (TypeError, ValueError):
        percent = 0.0

    percent = max(0.0, min(100.0, percent))
    message = "" if state.get("message") is None else str(state.get("message"))
    phase = None if state.get("phase") is None else str(state.get("phase"))
    eta_formatted = (
        None if state.get("eta_formatted") is None else str(state.get("eta_formatted"))
    )
    phases = state.get("phases")
    if not isinstance(phases, dict):
        phases = None

    return {
        "percent": round(percent, 2),
        "message": message,
        "phase": phase,
        "eta_formatted": eta_formatted,
        "phases": phases,
    }
