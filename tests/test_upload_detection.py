"""Tests for procedural upload detection."""

import sys
import types
from pathlib import Path

import server.upload.detection as detection
from server.upload.detection import group_files, scan_candidates, is_ignored_upload_path


def _record(tmp_path: Path, rel_path: str, ext: str) -> dict:
    abs_path = tmp_path / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    if ext == ".json":
        abs_path.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    else:
        abs_path.write_bytes(b"")
    return {
        "id": rel_path,
        "rel_path": rel_path,
        "abs_path": str(abs_path),
        "ext": ext,
        "size": abs_path.stat().st_size,
        "sha256": "dummy",
    }


def test_group_files_groups_shapefile_sidecars(tmp_path: Path):
    records = [
        _record(tmp_path, "roads.shp", ".shp"),
        _record(tmp_path, "roads.dbf", ".dbf"),
        _record(tmp_path, "roads.shx", ".shx"),
        _record(tmp_path, "other.geojson", ".geojson"),
    ]

    grouped = group_files(records)
    keys = [g["candidate_key"] for g in grouped]

    assert "roads" in keys
    roads_group = next(g for g in grouped if g["candidate_key"] == "roads")
    assert len(roads_group["files"]) == 3


def test_scan_candidates_detects_cityjson(tmp_path: Path):
    cityjson_path = tmp_path / "city.json"
    cityjson_path.write_text('{"type":"CityJSON","version":"1.1","CityObjects":{}}', encoding="utf-8")
    records = [
        {
            "id": "city.json",
            "rel_path": "city.json",
            "abs_path": str(cityjson_path),
            "ext": ".json",
            "size": cityjson_path.stat().st_size,
            "sha256": "dummy",
        }
    ]

    candidates = scan_candidates(records)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["inferred_type"] == "city_model"
    assert candidate["confidence"] == "high"
    assert candidate["role"] == "city-model"


def test_group_files_treats_shp_xml_as_shapefile_sidecar(tmp_path: Path):
    records = [
        _record(tmp_path, "footprints.shp", ".shp"),
        _record(tmp_path, "footprints.dbf", ".dbf"),
        _record(tmp_path, "footprints.shp.xml", ".shp.xml"),
    ]

    grouped = group_files(records)
    assert len(grouped) == 1
    assert grouped[0]["candidate_key"] == "footprints"
    assert len(grouped[0]["files"]) == 3


def test_scan_candidates_ignores_system_artifacts(tmp_path: Path):
    las_path = tmp_path / "a.las"
    las_path.write_bytes(b"dummy")
    ds_store = tmp_path / ".DS_Store"
    ds_store.write_bytes(b"junk")

    records = [
        {
            "id": "a.las",
            "rel_path": "a.las",
            "abs_path": str(las_path),
            "ext": ".las",
            "size": 5,
            "sha256": "x",
        },
        {
            "id": ".DS_Store",
            "rel_path": ".DS_Store",
            "abs_path": str(ds_store),
            "ext": "",
            "size": 4,
            "sha256": "y",
        },
    ]

    candidates = scan_candidates(records)
    assert len(candidates) == 1
    assert candidates[0]["primary_rel_path"] == "a.las"


def test_is_ignored_upload_path():
    assert is_ignored_upload_path(".DS_Store")
    assert is_ignored_upload_path("foo/._bar.shp")
    assert is_ignored_upload_path("__MACOSX/x/y")
    assert not is_ignored_upload_path("footprints/footprints.shp")


def test_scan_candidates_pointcloud_missing_crs_fallback(monkeypatch, tmp_path: Path):
    las_path = tmp_path / "a.las"
    las_path.write_bytes(b"fake-las")

    fake_info_mod = types.ModuleType("dtcc_core.io.info")

    def _broken_info_pointcloud(_path):
        raise AttributeError("'NoneType' object has no attribute 'name'")

    fake_info_mod.info_pointcloud = _broken_info_pointcloud
    fake_info_mod.info_vector = lambda _path: {}
    fake_info_mod.info_raster = lambda _path: {}
    fake_info_mod.info_mesh = lambda _path: {}

    monkeypatch.setitem(sys.modules, "dtcc_core.io.info", fake_info_mod)
    monkeypatch.setattr(
        detection,
        "_fallback_pointcloud_info",
        lambda _path, _ext: {
            "x_min": 0.0,
            "y_min": 0.0,
            "x_max": 1.0,
            "y_max": 1.0,
            "z_min": 0.0,
            "z_max": 1.0,
            "count": 10,
            "crs": "",
        },
    )

    records = [
        {
            "id": "a.las",
            "rel_path": "a.las",
            "abs_path": str(las_path),
            "ext": ".las",
            "size": las_path.stat().st_size,
            "sha256": "dummy",
        }
    ]

    candidates = scan_candidates(records)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["confidence"] == "high"
    assert "Inspection failed" not in " | ".join(candidate["warnings"])
