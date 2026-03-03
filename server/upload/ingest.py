"""Ingestion pipeline for upload candidates."""

from __future__ import annotations

import json
import mimetypes
import shutil
import uuid
from pathlib import Path
from typing import Any


def _slugify(name: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() or ch in "-_" else "-" for ch in name)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or "uploaded-dataset"


def _safe_rel_path(path: str) -> Path:
    norm = path.replace("\\", "/").lstrip("/")
    rel = Path(norm)
    if any(p == ".." for p in rel.parts):
        raise ValueError(f"Illegal relative path: {path}")
    return rel


def _normalize_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _normalize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalize_json_value(v) for v in value]
    return str(value)


def _copy_group_files(batch_root: Path, dataset_raw_dir: Path, rel_paths: list[str]) -> list[Path]:
    copied: list[Path] = []
    dataset_raw_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in rel_paths:
        rel = _safe_rel_path(rel_path)
        source = batch_root / rel
        if not source.exists():
            continue
        target = dataset_raw_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied.append(target)
    return copied


def _is_cityjson(path: Path) -> bool:
    if path.suffix.lower() != ".json":
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return isinstance(data, dict) and data.get("type") == "CityJSON"
    except Exception:
        return False


def _convert_vector_to_geojson(source_file: Path, canonical_geojson: Path) -> tuple[dict[str, Any], list[str]]:
    """
    Convert vector input to canonical GeoJSON.

    Returns:
        metadata, warnings
    """
    warnings: list[str] = []
    metadata: dict[str, Any] = {}
    canonical_geojson.parent.mkdir(parents=True, exist_ok=True)

    ext = source_file.suffix.lower()

    if ext in {".geojson", ".json"} and not _is_cityjson(source_file):
        data = json.loads(source_file.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            collection = data
        elif isinstance(data, dict) and data.get("type") == "Feature":
            collection = {"type": "FeatureCollection", "features": [data]}
            warnings.append("Input was a single Feature; wrapped into FeatureCollection.")
        else:
            raise ValueError("JSON vector input must be FeatureCollection or Feature.")
        canonical_geojson.write_text(json.dumps(collection), encoding="utf-8")
    else:
        try:
            import fiona
        except Exception as e:
            raise RuntimeError("Fiona is required for vector conversion.") from e

        layers = fiona.listlayers(source_file)
        layer = layers[0] if layers else None
        if layers and len(layers) > 1:
            warnings.append(
                f"Multiple vector layers found ({len(layers)}); using first layer '{layer}'."
            )

        features = []
        with fiona.open(source_file, layer=layer) as src:
            metadata["crs"] = src.crs.to_string() if src.crs else ""
            metadata["feature_count"] = len(src)
            metadata["bounds"] = [src.bounds[0], src.bounds[1], src.bounds[2], src.bounds[3]]
            for feat in src:
                props = {
                    str(k): _normalize_json_value(v)
                    for k, v in dict(feat.get("properties") or {}).items()
                }
                features.append(
                    {
                        "type": "Feature",
                        "id": feat.get("id"),
                        "geometry": feat.get("geometry"),
                        "properties": props,
                    }
                )

        collection = {"type": "FeatureCollection", "features": features}
        if "bounds" in metadata:
            collection["bbox"] = metadata["bounds"]
        canonical_geojson.write_text(json.dumps(collection), encoding="utf-8")

    # Inspect canonical output for normalized metadata.
    try:
        from dtcc_core.io.info import info_vector

        vector_info = info_vector(canonical_geojson)
        metadata.update(_normalize_json_value(vector_info))
    except Exception as e:
        warnings.append(f"Could not inspect canonical GeoJSON: {e}")

    return metadata, warnings


def detect_media_type(path: Path) -> str:
    suffixes = [s.lower() for s in path.suffixes]
    ext = "".join(suffixes[-2:]) if len(suffixes) >= 2 else path.suffix.lower()
    explicit_map = {
        ".geojson": "application/geo+json",
        ".json": "application/json",
        ".json.zip": "application/zip",
        ".las": "application/octet-stream",
        ".laz": "application/octet-stream",
        ".copc": "application/octet-stream",
        ".obj": "model/obj",
        ".stl": "model/stl",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }
    if ext in explicit_map:
        return explicit_map[ext]

    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def _extract_bounds(metadata: dict[str, Any]) -> list[float] | None:
    if "bounds" in metadata and isinstance(metadata["bounds"], list):
        if len(metadata["bounds"]) == 4:
            try:
                return [float(v) for v in metadata["bounds"]]
            except (TypeError, ValueError):
                return None

    keys = ("x_min", "y_min", "x_max", "y_max")
    if all(k in metadata for k in keys):
        try:
            return [
                float(metadata["x_min"]),
                float(metadata["y_min"]),
                float(metadata["x_max"]),
                float(metadata["y_max"]),
            ]
        except (TypeError, ValueError):
            return None
    return None


def _reserved_dataset_names() -> set[str]:
    names: set[str] = set()

    try:
        from dtcc_core import datasets

        names.update(str(name) for name in datasets.list().keys())
    except Exception:
        pass

    try:
        from server.vector.discovery import discover_published_datasets

        names.update(str(ds.get("name")) for ds in discover_published_datasets() if ds.get("name"))
    except Exception:
        pass

    return names


def _resolve_dataset_name(preferred_name: str, reserved_names: set[str]) -> tuple[str, str | None]:
    if preferred_name not in reserved_names:
        return preferred_name, None

    suffix_idx = 1
    while True:
        suffix = "-uploaded" if suffix_idx == 1 else f"-uploaded-{suffix_idx}"
        candidate = f"{preferred_name}{suffix}"
        if candidate not in reserved_names:
            warning = (
                f"Dataset name '{preferred_name}' is reserved by existing datasets; "
                f"renamed to '{candidate}'."
            )
            return candidate, warning
        suffix_idx += 1


def ingest_candidate(
    *,
    catalog,
    batch: dict[str, Any],
    candidate: dict[str, Any],
    datasets_root: Path,
    override_name: str | None = None,
    override_role: str | None = None,
    override_crs: str | None = None,
) -> dict[str, Any]:
    """Ingest one candidate and register a versioned uploaded dataset record."""
    batch_root = Path(batch["root_dir"])
    preferred_name = _slugify(override_name or candidate["name"])
    reserved_names = _reserved_dataset_names()
    dataset_name, rename_warning = _resolve_dataset_name(preferred_name, reserved_names)
    role = override_role or candidate["role"]
    inferred_type = candidate["inferred_type"]

    version = catalog.next_dataset_version(dataset_name)
    dataset_dir = datasets_root / dataset_name / f"v{version}"
    raw_dir = dataset_dir / "raw"
    canonical_dir = dataset_dir / "canonical"
    dataset_dir.mkdir(parents=True, exist_ok=True)

    copied = _copy_group_files(batch_root, raw_dir, candidate["group_rel_paths"])
    if not copied:
        raise FileNotFoundError("No source files were copied for candidate.")

    primary_rel = _safe_rel_path(candidate["primary_rel_path"])
    primary_source = raw_dir / primary_rel
    if not primary_source.exists():
        primary_source = copied[0]

    warnings = list(candidate.get("warnings", []))
    if rename_warning:
        warnings.append(rename_warning)
    metadata = dict(candidate.get("metadata", {}))

    if inferred_type == "vector":
        canonical_geojson = canonical_dir / "data.geojson"
        vector_meta, vector_warnings = _convert_vector_to_geojson(primary_source, canonical_geojson)
        metadata.update(vector_meta)
        warnings.extend(vector_warnings)
        serving_file = canonical_geojson
        detected_format = "geojson"
    else:
        serving_file = primary_source
        detected_format = candidate.get("detected_format", primary_source.suffix.lstrip("."))

    if inferred_type != "vector":
        # Try best-effort metadata enrichment for non-vector.
        try:
            from dtcc_core.io.info import info_mesh, info_pointcloud, info_raster

            if inferred_type == "point_cloud":
                metadata.update(info_pointcloud(serving_file))
            elif inferred_type == "raster":
                metadata.update(info_raster(serving_file))
            elif inferred_type == "mesh":
                metadata.update(info_mesh(serving_file))
            elif inferred_type == "city_model":
                metadata["city_model_type"] = "CityJSON" if _is_cityjson(serving_file) else "unknown"
        except Exception as e:
            warnings.append(f"Metadata enrichment failed: {e}")

    crs = override_crs if override_crs is not None else metadata.get("crs")
    bounds = _extract_bounds(metadata)
    metadata["warnings"] = warnings
    metadata["media_type"] = detect_media_type(serving_file)
    metadata["source_files"] = [str(p.relative_to(dataset_dir)) for p in copied]

    record = {
        "id": str(uuid.uuid4()),
        "dataset_name": dataset_name,
        "title": candidate.get("title") or dataset_name,
        "version": version,
        "inferred_type": inferred_type,
        "role": role,
        "source_batch_id": batch["id"],
        "storage_dir": str(dataset_dir),
        "primary_file": str(serving_file),
        "detected_format": detected_format,
        "crs": crs,
        "bounds": bounds,
        "metadata": metadata,
        "status": "active",
    }
    catalog.insert_uploaded_dataset(record)

    return {
        "candidate_id": candidate["id"],
        "success": True,
        "dataset_name": dataset_name,
        "version": version,
        "inferred_type": inferred_type,
        "role": role,
        "warnings": warnings,
        "bounds": bounds,
        "crs": crs,
    }
