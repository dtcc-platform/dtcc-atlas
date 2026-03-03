"""Tests for job data models in server/jobs/models.py."""

import json
import uuid

import pytest

from server.jobs.models import Job, JobStatus


# ── JobStatus ────────────────────────────────────────────────────────────────


class TestJobStatus:
    def test_values(self):
        assert JobStatus.QUEUED.value == "queued"
        assert JobStatus.PROCESSING.value == "processing"
        assert JobStatus.COMPLETE.value == "complete"
        assert JobStatus.FAILED.value == "failed"

    def test_member_count(self):
        assert len(JobStatus) == 4


# ── Job ──────────────────────────────────────────────────────────────────────


class TestJob:
    def test_default_construction(self):
        job = Job()
        assert job.dataset == ""
        assert job.params == {}
        assert job.status == JobStatus.QUEUED
        assert job.result_path is None
        assert job.error is None
        assert job.progress is None

    def test_uuid_format(self):
        job = Job()
        # Should be a valid UUID4
        parsed = uuid.UUID(job.id)
        assert parsed.version == 4

    def test_custom_fields(self):
        job = Job(dataset="elevation", params={"format": "tif"}, filename="my-file")
        assert job.dataset == "elevation"
        assert job.params == {"format": "tif"}
        assert job.filename == "my-file"

    def test_to_dict_keys(self):
        job = Job(dataset="test")
        d = job.to_dict()
        expected_keys = {
            "id", "dataset", "status", "filename", "error",
            "progress", "created_at", "completed_at", "params",
        }
        assert set(d.keys()) == expected_keys

    def test_to_dict_status_is_string(self):
        job = Job()
        d = job.to_dict()
        assert d["status"] == "queued"

    def test_to_dict_created_at_is_iso(self):
        job = Job()
        d = job.to_dict()
        # Should be a parseable ISO timestamp string
        assert isinstance(d["created_at"], str)
        assert "T" in d["created_at"]

    def test_to_dict_completed_at_none(self):
        job = Job()
        d = job.to_dict()
        assert d["completed_at"] is None

    def test_to_dict_json_serializable(self):
        job = Job(dataset="test", params={"bounds": [1, 2, 3, 4]})
        d = job.to_dict()
        serialized = json.dumps(d)
        assert isinstance(serialized, str)
