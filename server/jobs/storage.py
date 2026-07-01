"""Temporary file storage for job results."""

import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime, timedelta


class JobStorage:
    """Manages temporary storage for job result files."""

    def __init__(self, max_age_hours: float = 1.0):
        """
        Initialize job storage.

        Args:
            max_age_hours: Maximum age in hours before files are cleaned up.
        """
        self.max_age = timedelta(hours=max_age_hours)
        self._temp_dir = Path(tempfile.mkdtemp(prefix="dtcc_jobs_"))
        self._lock = threading.Lock()
        self._file_times: dict[str, datetime] = {}

    @property
    def temp_dir(self) -> Path:
        return self._temp_dir

    @staticmethod
    def _matches_job_id(filepath: Path, job_id: str) -> bool:
        """Match files by job-id prefix, including multi-part extensions."""
        return filepath.name == job_id or filepath.name.startswith(f"{job_id}.")

    def save_result(self, job_id: str, data: bytes, extension: str = "bin") -> str:
        """
        Save job result to temporary file.

        Args:
            job_id: The job ID.
            data: Binary data to save.
            extension: File extension.

        Returns:
            Path to the saved file.

        Raises:
            ValueError: If data is empty or invalid.
        """
        if not data or not isinstance(data, bytes):
            raise ValueError("Invalid or empty data received")

        filename = f"{job_id}.{extension}"
        filepath = self._temp_dir / filename

        with self._lock:
            with open(filepath, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            self._file_times[job_id] = datetime.now()

        return str(filepath)

    def get_result(self, job_id: str) -> Optional[Tuple[bytes, str]]:
        """
        Get job result from storage.

        Args:
            job_id: The job ID.

        Returns:
            Tuple of (data, filepath) or None if not found.
        """
        with self._lock:
            # Find file with matching job_id prefix
            for filepath in self._temp_dir.iterdir():
                if self._matches_job_id(filepath, job_id):
                    with open(filepath, "rb") as f:
                        return (f.read(), str(filepath))
        return None

    def get_result_path(self, job_id: str) -> Optional[str]:
        """
        Get path to job result file.

        Args:
            job_id: The job ID.

        Returns:
            File path or None if not found.
        """
        with self._lock:
            for filepath in self._temp_dir.iterdir():
                if self._matches_job_id(filepath, job_id):
                    return str(filepath)
        return None

    def delete_result(self, job_id: str) -> bool:
        """
        Delete job result file.

        Args:
            job_id: The job ID.

        Returns:
            True if file was deleted, False if not found.
        """
        with self._lock:
            for filepath in self._temp_dir.iterdir():
                if self._matches_job_id(filepath, job_id):
                    filepath.unlink()
                    self._file_times.pop(job_id, None)
                    return True
        return False

    def cleanup_old(self) -> int:
        """
        Remove files older than max_age.

        Returns:
            Number of files removed.
        """
        removed = 0
        now = datetime.now()

        with self._lock:
            expired_jobs = [
                job_id
                for job_id, created in self._file_times.items()
                if now - created > self.max_age
            ]

            for job_id in expired_jobs:
                for filepath in self._temp_dir.iterdir():
                    if self._matches_job_id(filepath, job_id):
                        try:
                            filepath.unlink()
                            removed += 1
                        except OSError:
                            pass
                self._file_times.pop(job_id, None)

        return removed

    def cleanup_all(self) -> None:
        """Remove all temporary files and the temp directory."""
        import shutil
        with self._lock:
            if self._temp_dir.exists():
                shutil.rmtree(self._temp_dir, ignore_errors=True)
            self._file_times.clear()
