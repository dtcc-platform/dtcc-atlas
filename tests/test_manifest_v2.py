"""Tests for Dataset Manifest v2 Atlas helpers."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.skipif(not os.environ.get("DTCC_CORE_CONTRACT_DIR"), reason="requires the Core contract artifact")
def test_canonical_discovery_uses_real_core_admission(tmp_path):
    # Atlas' normal test fixture mocks Core globally. A clean process exercises
    # the actual consumer and rejects damaged stored model data.
    script = '''
import os, zipfile
from pathlib import Path
from server.vector.discovery import discover_published_datasets, get_dataset_artifact
root = Path(os.environ["ATLAS_CONTRACT_OUTPUT"])
with zipfile.ZipFile(Path(os.environ["DTCC_CORE_CONTRACT_DIR"]) / "canonical.dtccpkg") as archive:
    archive.extractall(root / "canonical-raster")
listed = discover_published_datasets(root)
assert listed[0]["type"] == "dataset_manifest_v3"
assert listed[0]["display_artifact"]["format"] == "png"
model, artifact = get_dataset_artifact("canonical-raster", "dtcc", root)
assert artifact["role"] == "canonical_model"
model.write_bytes(b"corrupt")
try:
    get_dataset_artifact("canonical-raster", "dtcc", root)
except ValueError:
    pass
else:
    raise AssertionError("Corrupt native model was served")
'''
    env = dict(os.environ, ATLAS_CONTRACT_OUTPUT=str(tmp_path))
    repo = Path(__file__).resolve().parents[1]
    env["PYTHONPATH"] = os.pathsep.join([str(repo.parent / "dtcc-core"), str(repo)])
    completed = subprocess.run([sys.executable, "-c", script], env=env, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stdout + completed.stderr

from server.datasets.manifest_v2 import (
    ManifestV2Error,
    load_manifest_v2,
    manifest_v2_summary,
    select_display_artifact,
)


def _manifest(*artifacts):
    return {
        "schema_version": "dtcc-dataset-manifest-v2",
        "identity": {"name": "smoke", "title": "Smoke"},
        "metadata": {"description": "Synthetic smoke."},
        "provenance": {},
        "presentation": {"summary": "A smoke view."},
        "request": {"dataset_name": "smoke", "bounds": [0, 0, 10, 20]},
        "artifacts": list(artifacts),
    }


def _artifact(path, *, role="primary", format="png", media_type="image/png", data_kind="raster", bounds=None):
    artifact = {
        "path": path,
        "role": role,
        "format": format,
        "media_type": media_type,
        "data_kind": data_kind,
    }
    if bounds is not None:
        artifact["bounds"] = bounds
    return artifact


def test_select_display_artifact_prefers_primary_png_over_mesh():
    manifest = _manifest(
        _artifact(
            "artifacts/smoke.vtu",
            format="vtu",
            media_type="application/vnd.vtk.vtu+xml",
            data_kind="mesh",
        ),
        _artifact("artifacts/smoke.png", role="primary", bounds=[1, 2, 3, 4]),
    )

    assert select_display_artifact(manifest)["path"] == "artifacts/smoke.png"


def test_summary_uses_manifest_metadata_and_selected_artifact_bounds():
    manifest = _manifest(_artifact("artifacts/smoke.png", bounds=[1, 2, 3, 4]))

    summary = manifest_v2_summary(manifest)

    assert summary["title"] == "Smoke"
    assert summary["description"] == "Synthetic smoke."
    assert summary["bounds"] == [1, 2, 3, 4]
    assert summary["display_artifact"]["path"] == "artifacts/smoke.png"
    assert summary["artifacts"][0]["path"] == "artifacts/smoke.png"


def test_load_manifest_v2_rejects_unsafe_artifact_paths(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(_manifest(_artifact("../smoke.png"))), encoding="utf-8")

    with pytest.raises(ManifestV2Error, match="Invalid artifact path"):
        load_manifest_v2(path)


def test_select_display_artifact_rejects_unsupported_packages():
    manifest = _manifest(
        _artifact(
            "artifacts/smoke.vtu",
            format="vtu",
            media_type="application/vnd.vtk.vtu+xml",
            data_kind="mesh",
        )
    )

    with pytest.raises(ManifestV2Error, match="no displayable"):
        select_display_artifact(manifest)
