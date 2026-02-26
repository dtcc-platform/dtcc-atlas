"""Procedural file grouping and dataset candidate detection."""

from __future__ import annotations

import json
import re
import uuid
import zipfile
from pathlib import Path
from typing import Any


SHAPEFILE_SIDECARS = {
    ".shp",
    ".shx",
    ".dbf",
    ".prj",
    ".cpg",
    ".qpj",
    ".sbn",
    ".sbx",
    ".shp.xml",
}

POINT_CLOUD_EXTS = {".las", ".laz", ".csv", ".txt"}
VECTOR_EXTS = {".geojson", ".gpkg", ".shp"}
RASTER_EXTS = {".tif", ".tiff", ".asc", ".png", ".jpg", ".jpeg"}
MESH_EXTS = {".obj", ".stl", ".ply", ".vtk", ".vtu", ".xdmf", ".inp", ".bdf"}
CITY_MODEL_EXTS = {".json.zip"}
IGNORED_FILENAMES = {".ds_store", "thumbs.db", "desktop.ini"}


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    return slug or "uploaded-dataset"


def _default_role(inferred_type: str) -> str:
    return {
        "point_cloud": "point-cloud-source",
        "vector": "generic-vector",
        "raster": "terrain-raster",
        "mesh": "mesh",
        "city_model": "city-model",
        "unknown": "unknown",
    }.get(inferred_type, "unknown")


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    # Support dtcc_core Bounds-like objects.
    for attrs in (("x_min", "y_min", "x_max", "y_max"), ("xmin", "ymin", "xmax", "ymax")):
        if all(hasattr(value, a) for a in attrs):
            try:
                return [
                    float(getattr(value, attrs[0])),
                    float(getattr(value, attrs[1])),
                    float(getattr(value, attrs[2])),
                    float(getattr(value, attrs[3])),
                ]
            except Exception:
                break
    return str(value)


def _is_cityjson_file(path: Path) -> bool:
    lower_suffixes = [s.lower() for s in path.suffixes]

    if path.suffix.lower() == ".zip" and "".join(lower_suffixes[-2:]) == ".json.zip":
        try:
            with zipfile.ZipFile(path, "r") as zf:
                json_files = [n for n in zf.namelist() if n.lower().endswith(".json")]
                if not json_files:
                    return False
                with zf.open(json_files[0]) as f:
                    data = json.load(f)
                return isinstance(data, dict) and data.get("type") == "CityJSON"
        except Exception:
            return False

    if path.suffix.lower() == ".json":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return isinstance(data, dict) and data.get("type") == "CityJSON"
        except Exception:
            return False

    return False


def _file_suffix(path: Path) -> str:
    suffixes = path.suffixes
    if len(suffixes) >= 2 and "".join(suffixes[-2:]).lower() == ".json.zip":
        return ".json.zip"
    if len(suffixes) >= 2 and "".join(suffixes[-2:]).lower() == ".shp.xml":
        return ".shp.xml"
    return path.suffix.lower()


def is_ignored_upload_path(rel_path: str) -> bool:
    path = Path(rel_path)
    name = path.name.lower()
    if name in IGNORED_FILENAMES:
        return True
    if name.startswith("._"):
        return True
    return any(part.lower() == "__macosx" for part in path.parts)


def group_files(file_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group related files into dataset candidates."""
    grouped: dict[str, dict[str, Any]] = {}

    for record in file_records:
        rel_path = record["rel_path"]
        rel = Path(rel_path)
        ext = record["ext"].lower()

        if ext == ".shp.xml":
            key = str(rel.with_suffix("").with_suffix(""))
        elif ext in SHAPEFILE_SIDECARS:
            key = str(rel.with_suffix(""))
        elif ext in {".xdmf", ".h5"}:
            key = str(rel.with_suffix(""))
        else:
            key = str(rel)

        if key not in grouped:
            grouped[key] = {"candidate_key": key, "files": []}
        grouped[key]["files"].append(record)

    result = []
    for key, value in grouped.items():
        files = sorted(value["files"], key=lambda f: f["rel_path"])
        primary = _choose_primary_file(files)
        result.append(
            {
                "candidate_key": key,
                "files": files,
                "primary": primary,
            }
        )
    return sorted(result, key=lambda g: g["candidate_key"])


def _choose_primary_file(files: list[dict[str, Any]]) -> dict[str, Any]:
    by_ext: dict[str, dict[str, Any]] = {f["ext"].lower(): f for f in files}
    for preferred in (".shp", ".geojson", ".gpkg", ".xdmf", ".las", ".laz", ".tif"):
        if preferred in by_ext:
            return by_ext[preferred]
    return files[0]


def _infer_type(primary_path: Path, primary_ext: str) -> str:
    if primary_ext in POINT_CLOUD_EXTS:
        return "point_cloud"
    if primary_ext in VECTOR_EXTS:
        return "vector"
    if primary_ext in RASTER_EXTS:
        return "raster"
    if primary_ext in MESH_EXTS:
        return "mesh"
    if primary_ext in CITY_MODEL_EXTS or _is_cityjson_file(primary_path):
        return "city_model"
    if primary_ext == ".json":
        return "city_model" if _is_cityjson_file(primary_path) else "vector"
    return "unknown"


def _to_bounds(info_data: dict[str, Any]) -> list[float] | None:
    raw_bounds = info_data.get("bounds")
    if isinstance(raw_bounds, list) and len(raw_bounds) >= 4:
        try:
            return [
                float(raw_bounds[0]),
                float(raw_bounds[1]),
                float(raw_bounds[2]),
                float(raw_bounds[3]),
            ]
        except (TypeError, ValueError):
            pass

    keys = ("x_min", "y_min", "x_max", "y_max")
    if all(k in info_data for k in keys):
        try:
            return [
                float(info_data["x_min"]),
                float(info_data["y_min"]),
                float(info_data["x_max"]),
                float(info_data["y_max"]),
            ]
        except (TypeError, ValueError):
            return None
    return None


def _fallback_pointcloud_info(primary_path: Path, ext: str) -> dict[str, Any] | None:
    ext = ext.lower()
    if ext not in {".las", ".laz"}:
        return None

    try:
        import laspy
    except Exception:
        return None

    src = laspy.read(primary_path)
    crs = src.header.parse_crs()
    return {
        "type": "pointcloud",
        "path": str(primary_path),
        "crs": crs.name if crs is not None else "",
        "x_min": float(src.header.x_min),
        "x_max": float(src.header.x_max),
        "y_min": float(src.header.y_min),
        "y_max": float(src.header.y_max),
        "z_min": float(src.header.z_min),
        "z_max": float(src.header.z_max),
        "count": int(src.header.point_count),
    }


def _inspect_candidate(inferred_type: str, primary_path: Path) -> tuple[dict[str, Any], list[str], str]:
    """Return metadata, warnings, confidence."""
    metadata: dict[str, Any] = {}
    warnings: list[str] = []
    confidence = "medium" if inferred_type != "unknown" else "low"

    try:
        from dtcc_core.io.info import (
            info_mesh,
            info_pointcloud,
            info_raster,
            info_vector,
        )
    except Exception:
        info_mesh = info_pointcloud = info_raster = info_vector = None

    try:
        if inferred_type == "point_cloud" and info_pointcloud:
            try:
                metadata.update(_json_safe(info_pointcloud(primary_path)))
                confidence = "high"
            except Exception as e:
                fallback = _fallback_pointcloud_info(primary_path, primary_path.suffix)
                if fallback is not None:
                    metadata.update(_json_safe(fallback))
                    confidence = "high"
                    if metadata.get("crs", "") == "":
                        warnings.append("Point cloud has no CRS in header.")
                else:
                    raise e
        elif inferred_type == "vector" and info_vector:
            metadata.update(_json_safe(info_vector(primary_path)))
            confidence = "high"
        elif inferred_type == "raster" and info_raster:
            metadata.update(_json_safe(info_raster(primary_path)))
            confidence = "high"
        elif inferred_type == "mesh" and info_mesh:
            metadata.update(_json_safe(info_mesh(primary_path)))
            confidence = "high"
        elif inferred_type == "city_model":
            if _is_cityjson_file(primary_path):
                metadata["type"] = "city_model"
                metadata["city_model_type"] = "CityJSON"
                confidence = "high"
            else:
                warnings.append("Could not validate CityJSON structure.")
        elif inferred_type == "unknown":
            warnings.append("Unsupported or unknown file type.")
    except Exception as e:
        warnings.append(f"Inspection failed: {e}")

    bounds = _to_bounds(metadata)
    if bounds:
        metadata["bounds"] = bounds

    return metadata, warnings, confidence


def scan_candidates(file_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create candidate descriptors from uploaded files."""
    relevant_records = [r for r in file_records if not is_ignored_upload_path(r["rel_path"])]
    grouped = group_files(relevant_records)
    candidates: list[dict[str, Any]] = []

    for group in grouped:
        primary = group["primary"]
        primary_rel = primary["rel_path"]
        primary_path = Path(primary["abs_path"])
        primary_ext = primary["ext"].lower()
        inferred_type = _infer_type(primary_path, primary_ext)
        metadata, warnings, confidence = _inspect_candidate(inferred_type, primary_path)

        stem = Path(primary_rel).name
        if primary_ext and stem.lower().endswith(primary_ext.lower()):
            stem = stem[: -len(primary_ext)]
        dataset_name = _slugify(stem)

        candidates.append(
            {
                "id": str(uuid.uuid4()),
                "candidate_key": group["candidate_key"],
                "name": dataset_name,
                "title": stem or dataset_name,
                "inferred_type": inferred_type,
                "role": _default_role(inferred_type),
                "confidence": confidence,
                "primary_rel_path": primary_rel,
                "group_rel_paths": [f["rel_path"] for f in group["files"]],
                "warnings": warnings,
                "metadata": metadata,
                "detected_format": primary_ext.lstrip("."),
            }
        )

    return candidates
