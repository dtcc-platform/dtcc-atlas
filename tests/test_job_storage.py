"""Tests for JobStorage in server/jobs/storage.py."""

from datetime import datetime, timedelta

import pytest

from server.jobs.storage import JobStorage


@pytest.fixture
def storage():
    s = JobStorage(max_age_hours=1.0)
    yield s
    s.cleanup_all()


class TestJobStorage:
    def test_save_and_get_roundtrip(self, storage):
        data = b"hello world"
        storage.save_result("job-1", data, "bin")
        result = storage.get_result("job-1")
        assert result is not None
        assert result[0] == data

    def test_save_returns_path(self, storage):
        path = storage.save_result("job-2", b"data", "txt")
        assert path.endswith(".txt")
        assert "job-2" in path

    def test_empty_data_raises(self, storage):
        with pytest.raises(ValueError):
            storage.save_result("job-3", b"", "bin")

    def test_non_bytes_raises(self, storage):
        with pytest.raises(ValueError):
            storage.save_result("job-4", "string data", "bin")

    def test_get_unknown_returns_none(self, storage):
        assert storage.get_result("nonexistent") is None

    def test_get_tar_gz_result_by_job_id(self, storage):
        data = b"archive-bytes"
        storage.save_result("job-archive", data, "tar.gz")
        result = storage.get_result("job-archive")
        assert result is not None
        assert result[0] == data
        assert result[1].endswith(".tar.gz")

    def test_delete_works(self, storage):
        storage.save_result("job-5", b"data", "bin")
        assert storage.delete_result("job-5") is True
        assert storage.get_result("job-5") is None

    def test_delete_tar_gz_result_by_job_id(self, storage):
        storage.save_result("job-archive", b"data", "tar.gz")
        assert storage.delete_result("job-archive") is True
        assert storage.get_result("job-archive") is None

    def test_delete_unknown_returns_false(self, storage):
        assert storage.delete_result("nonexistent") is False

    def test_cleanup_old_removes_expired(self, storage):
        storage.save_result("old-job", b"data", "bin")
        # Backdate the file time
        storage._file_times["old-job"] = datetime.now() - timedelta(hours=2)
        removed = storage.cleanup_old()
        assert removed == 1
        assert storage.get_result("old-job") is None

    def test_cleanup_old_preserves_recent(self, storage):
        storage.save_result("new-job", b"data", "bin")
        removed = storage.cleanup_old()
        assert removed == 0
        assert storage.get_result("new-job") is not None

    def test_cleanup_all(self, storage):
        storage.save_result("job-a", b"data", "bin")
        storage.save_result("job-b", b"data", "bin")
        storage.cleanup_all()
        assert not storage.temp_dir.exists()
