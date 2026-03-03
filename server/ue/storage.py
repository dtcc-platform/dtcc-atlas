"""Persistent file storage for UE artifacts."""

import os
import threading
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta


class ArtifactStorage:
    """Manages persistent storage for UE artifact files.

    Unlike JobStorage (which uses a system temp directory), ArtifactStorage
    uses a configurable persistent directory and a longer retention period.
    """

    def __init__(self, artifact_dir: Path, max_age_hours: float = 24.0):
        """
        Initialize artifact storage.

        Args:
            artifact_dir: Persistent directory for artifact files.
            max_age_hours: Maximum age in hours before files are cleaned up.
        """
        self.max_age = timedelta(hours=max_age_hours)
        self._artifact_dir = artifact_dir
        self._lock = threading.Lock()
        self._file_times: dict[str, datetime] = {}

        # Ensure the directory exists
        self._artifact_dir.mkdir(parents=True, exist_ok=True)

    @property
    def artifact_dir(self) -> Path:
        return self._artifact_dir

    def save_result(self, artifact_id: str, data: bytes, extension: str = "bin") -> str:
        """
        Save artifact result to persistent file.

        Args:
            artifact_id: The artifact ID.
            data: Binary data to save.
            extension: File extension.

        Returns:
            Path to the saved file.

        Raises:
            ValueError: If data is empty or invalid.
        """
        if not data or not isinstance(data, bytes):
            raise ValueError("Invalid or empty data received")

        filename = f"{artifact_id}.{extension}"
        filepath = self._artifact_dir / filename

        with self._lock:
            with open(filepath, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            self._file_times[artifact_id] = datetime.now()

        return str(filepath)

    def get_file_path(self, artifact_id: str) -> Optional[str]:
        """
        Get path to artifact file.

        Args:
            artifact_id: The artifact ID.

        Returns:
            File path or None if not found.
        """
        with self._lock:
            for filepath in self._artifact_dir.iterdir():
                if filepath.stem == artifact_id:
                    return str(filepath)
        return None

    def get_file_size(self, artifact_id: str) -> Optional[int]:
        """
        Get size of artifact file in bytes.

        Args:
            artifact_id: The artifact ID.

        Returns:
            File size in bytes or None if not found.
        """
        with self._lock:
            for filepath in self._artifact_dir.iterdir():
                if filepath.stem == artifact_id:
                    try:
                        return filepath.stat().st_size
                    except OSError:
                        return None
        return None

    def cleanup_old(self) -> int:
        """
        Remove files older than max_age.

        Returns:
            Number of files removed.
        """
        removed = 0
        now = datetime.now()

        with self._lock:
            expired_ids = [
                artifact_id
                for artifact_id, created in self._file_times.items()
                if now - created > self.max_age
            ]

            for artifact_id in expired_ids:
                for filepath in self._artifact_dir.iterdir():
                    if filepath.stem == artifact_id:
                        try:
                            filepath.unlink()
                            removed += 1
                        except OSError:
                            pass
                self._file_times.pop(artifact_id, None)

        return removed

    def cleanup_all(self) -> None:
        """Remove all artifact files (but keep the directory)."""
        with self._lock:
            for filepath in self._artifact_dir.iterdir():
                try:
                    filepath.unlink()
                except OSError:
                    pass
            self._file_times.clear()
