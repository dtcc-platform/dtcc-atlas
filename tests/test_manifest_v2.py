"""Tests for Dataset Manifest v2 Atlas helpers."""

from __future__ import annotations

import json

import pytest

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
