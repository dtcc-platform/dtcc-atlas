"""Tests for remote task plumbing in server/jobs/manager.py."""

import queue
import sys
import types
from unittest.mock import MagicMock

from server.jobs.manager import JobManager, _worker_wrapper


def test_worker_wrapper_emits_remote_task_info_and_result(monkeypatch):
    messages = queue.SimpleQueue()

    def fake_process_dataset_job(
        dataset,
        params,
        on_progress=None,
        cached_discoveries=None,
        on_remote_info=None,
    ):
        if on_remote_info:
            on_remote_info({"remote_task_id": "task-1", "cancel_url": "http://sim/cancel/task-1"})
        return (b"data", "pb", "application/x-protobuf")

    monkeypatch.setattr(
        "server.jobs.manager.process_dataset_job",
        fake_process_dataset_job,
    )

    _worker_wrapper(messages, "remote_mesh", {"bounds": [0, 0, 1, 1]}, {"cached": True})

    first = messages.get()
    second = messages.get()
    assert first == {
        "type": "remote_task_info",
        "data": {"remote_task_id": "task-1", "cancel_url": "http://sim/cancel/task-1"},
    }
    assert second == {
        "type": "result",
        "data": (b"data", "pb", "application/x-protobuf"),
    }


def test_revoke_remote_task_posts_cancel_url(monkeypatch):
    calls = []
    httpx_mod = types.ModuleType("httpx")
    httpx_mod.post = lambda url, timeout=5: calls.append((url, timeout))
    monkeypatch.setitem(sys.modules, "httpx", httpx_mod)

    manager = JobManager(job_timeout=30.0)
    try:
        manager._remote_task_info["job-1"] = {"cancel_url": "http://sim/cancel/job-1"}
        manager._revoke_remote_task("job-1")
    finally:
        manager.shutdown()

    assert calls == [("http://sim/cancel/job-1", 5)]
    assert "job-1" not in manager._remote_task_info


def test_resolve_job_timeout_uses_dataset_timeout_hint(monkeypatch):
    manager = JobManager(job_timeout=30.0)
    try:
        dataset = type("Dataset", (), {"timeout_hint": 900})()
        monkeypatch.setattr(
            sys.modules["dtcc_core"].datasets,
            "list",
            MagicMock(return_value={"slow_remote": dataset}),
        )
        assert manager._resolve_job_timeout("slow_remote") == 900.0
        assert manager._resolve_job_timeout("missing") == 30.0
    finally:
        manager.shutdown()
