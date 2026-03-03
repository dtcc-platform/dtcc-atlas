"""Tests for session_id scoping on jobs."""

import asyncio
import threading
from datetime import datetime, timedelta

import pytest

from server.jobs.models import Job, JobStatus
from server.jobs.manager import JobManager


# ── Job model tests ─────────────────────────────────────────────────────────


class TestJobSessionId:
    def test_job_has_session_id(self):
        job = Job(dataset="test", session_id="abc123")
        assert job.session_id == "abc123"
        d = job.to_dict()
        assert d["session_id"] == "abc123"

    def test_job_session_id_defaults_none(self):
        job = Job(dataset="test")
        assert job.session_id is None

    def test_to_dict_includes_session_id_key(self):
        job = Job(dataset="test")
        d = job.to_dict()
        assert "session_id" in d
        assert d["session_id"] is None

    def test_to_dict_session_id_with_value(self):
        job = Job(dataset="test", session_id="sess-xyz")
        d = job.to_dict()
        assert d["session_id"] == "sess-xyz"


# ── JobManager session filtering tests ──────────────────────────────────────


class TestJobManagerSessionScoping:
    def _make_manager(self):
        """Create a minimal JobManager for testing (no actual workers)."""
        return JobManager(max_workers=0, job_timeout=1.0)

    def test_submit_stores_session_id(self):
        mgr = self._make_manager()
        loop = asyncio.new_event_loop()
        try:
            job = loop.run_until_complete(
                mgr.submit(dataset="test", params={}, session_id="sess-1")
            )
            assert job.session_id == "sess-1"
        finally:
            loop.close()
            mgr.shutdown()

    def test_submit_without_session_id(self):
        mgr = self._make_manager()
        loop = asyncio.new_event_loop()
        try:
            job = loop.run_until_complete(
                mgr.submit(dataset="test", params={})
            )
            assert job.session_id is None
        finally:
            loop.close()
            mgr.shutdown()

    def test_list_jobs_by_session(self):
        mgr = self._make_manager()
        loop = asyncio.new_event_loop()
        try:
            j1 = loop.run_until_complete(
                mgr.submit(dataset="d1", params={}, session_id="sess-A")
            )
            j2 = loop.run_until_complete(
                mgr.submit(dataset="d2", params={}, session_id="sess-B")
            )
            j3 = loop.run_until_complete(
                mgr.submit(dataset="d3", params={}, session_id="sess-A")
            )

            result_a = mgr.list_jobs_by_session("sess-A")
            result_b = mgr.list_jobs_by_session("sess-B")
            result_c = mgr.list_jobs_by_session("sess-C")

            assert len(result_a) == 2
            assert len(result_b) == 1
            assert len(result_c) == 0

            # Should contain the right jobs
            ids_a = {j.id for j in result_a}
            assert j1.id in ids_a
            assert j3.id in ids_a
            assert j2.id not in ids_a

            ids_b = {j.id for j in result_b}
            assert j2.id in ids_b
        finally:
            loop.close()
            mgr.shutdown()

    def test_list_jobs_by_session_newest_first(self):
        mgr = self._make_manager()
        loop = asyncio.new_event_loop()
        try:
            j1 = loop.run_until_complete(
                mgr.submit(dataset="first", params={}, session_id="sess-1")
            )
            j2 = loop.run_until_complete(
                mgr.submit(dataset="second", params={}, session_id="sess-1")
            )

            result = mgr.list_jobs_by_session("sess-1")
            assert len(result) == 2
            # Newest first
            assert result[0].id == j2.id
            assert result[1].id == j1.id
        finally:
            loop.close()
            mgr.shutdown()
