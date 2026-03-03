"""UE artifact data models."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any, List
import uuid
from datetime import datetime


class ArtifactStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Artifact:
    """Represents a UE artifact — a dataset generated for delivery to Unreal Engine."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    dataset: str = ""
    bounds: List[float] = field(default_factory=list)
    params: Dict[str, Any] = field(default_factory=dict)
    status: ArtifactStatus = ArtifactStatus.QUEUED
    format: Optional[str] = None
    content_type: str = "application/octet-stream"
    filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    download_url: Optional[str] = None
    result_path: Optional[str] = None
    error: Optional[str] = None
    job_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert artifact to dictionary for JSON serialization."""
        return {
            "artifact_id": self.id,
            "dataset": self.dataset,
            "status": self.status.value,
            "format": self.format,
            "content_type": self.content_type,
            "bounds": self.bounds,
            "download_url": self.download_url,
            "file_size_bytes": self.file_size_bytes,
            "filename": self.filename,
            "error": self.error,
            "job_id": self.job_id,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def to_summary_dict(self) -> Dict[str, Any]:
        """Convert artifact to a compact summary dictionary for list responses."""
        return {
            "artifact_id": self.id,
            "dataset": self.dataset,
            "status": self.status.value,
            "format": self.format,
            "bounds": self.bounds,
            "created_at": self.created_at.isoformat(),
        }
