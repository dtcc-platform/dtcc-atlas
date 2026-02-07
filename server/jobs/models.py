"""Job data models."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any
import uuid
from datetime import datetime


class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Job:
    """Represents a dataset download job."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    dataset: str = ""
    params: Dict[str, Any] = field(default_factory=dict)
    status: JobStatus = JobStatus.QUEUED
    result_path: Optional[str] = None
    error: Optional[str] = None
    filename: Optional[str] = None
    content_type: str = "application/octet-stream"
    progress: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "dataset": self.dataset,
            "status": self.status.value,
            "filename": self.filename,
            "error": self.error,
            "progress": self.progress,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "params": self.params,
        }
