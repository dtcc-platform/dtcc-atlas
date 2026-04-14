"""Tests for remote dataset handling in server/jobs/worker.py."""

import sys
import types
from unittest.mock import MagicMock

import server.jobs.worker as worker


def test_process_dataset_job_bootstraps_remote_from_cached_discoveries(monkeypatch):
    progress_updates = []
    remote_infos = []

    class RemoteDataset:
        source_service = "dtcc-sim"
        supported_formats = ["pb"]
        timeout_hint = 600

        class ArgsModel:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        def validate(self, params):
            return dict(params)

        def build(self, validated, progress_callback=None, remote_info_callback=None):
            if progress_callback:
                progress_callback({"percent": 25.123, "message": "Remote running"})
            if remote_info_callback:
                remote_info_callback(
                    {
                        "remote_task_id": "remote-1",
                        "cancel_url": "http://sim/api/v1/cancel/remote-1",
                    }
                )
            return (b"remote-bytes", "tar.gz", "application/gzip")

    datasets_mod = sys.modules["dtcc_core.datasets"]
    monkeypatch.setattr(
        datasets_mod,
        "list",
        MagicMock(side_effect=[{}, {"remote_mesh": RemoteDataset()}]),
    )

    remote_mod = types.ModuleType("dtcc_core.datasets.remote")
    remote_mod.register_remote_descriptors_from_cache = lambda cached: None
    monkeypatch.setitem(sys.modules, "dtcc_core.datasets.remote", remote_mod)

    result = worker.process_dataset_job(
        "remote_mesh",
        {"bounds": [0, 0, 1, 1]},
        on_progress=progress_updates.append,
        cached_discoveries={"http://sim": {"datasets": {}}},
        on_remote_info=remote_infos.append,
    )

    assert result == (b"remote-bytes", "tar.gz", "application/gzip")
    assert progress_updates == [
        {
            "percent": 25.12,
            "message": "Remote running",
            "phase": None,
            "eta_formatted": None,
            "phases": None,
        }
    ]
    assert remote_infos == [
        {
            "remote_task_id": "remote-1",
            "cancel_url": "http://sim/api/v1/cancel/remote-1",
        }
    ]
