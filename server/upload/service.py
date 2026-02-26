"""Upload service helpers used by API routes and dataset/job integration."""

from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import Any

from server.config import CATALOG_DATASETS_DIR, CATALOG_DB_PATH
from server.vector.routes import clip_features_to_bounds

from .catalog import UploadCatalog


_catalog_singleton: UploadCatalog | None = None


def get_catalog() -> UploadCatalog:
    global _catalog_singleton
    if _catalog_singleton is None:
        _catalog_singleton = UploadCatalog(CATALOG_DB_PATH)
    return _catalog_singleton


def list_uploaded_datasets_for_api() -> list[dict[str, Any]]:
    catalog = get_catalog()
    records = catalog.list_uploaded_datasets(latest_only=True)
    result = []
    for rec in records:
        inferred_type = rec.get("inferred_type", "unknown")
        detected_format = rec.get("detected_format")
        result.append(
            {
                "name": rec["dataset_name"],
                "title": rec.get("title") or rec["dataset_name"],
                "type": _dataset_type_to_ui_type(inferred_type),
                "source": "user-uploaded",
                "source_group": "user-uploaded",
                "source_label": "User Upload",
                "path": rec["storage_dir"],
                "role": rec.get("role", ""),
                "version": rec.get("version", 1),
                "crs": rec.get("crs"),
                "bounds": rec.get("bounds"),
                "data_kind": inferred_type,
                "data_kind_label": _format_data_kind_label(inferred_type),
                "return_types": [inferred_type],
                "supported_formats": [detected_format] if detected_format else [],
                "upload_batch_id": rec.get("source_batch_id"),
                "upload_name": rec.get("batch_name") or "User upload",
                "uploaded_at": rec.get("batch_created_at") or rec.get("created_at"),
            }
        )
    return result


def _dataset_type_to_ui_type(inferred_type: str) -> str:
    # Keep compatibility with existing UI coloring/labels.
    mapping = {
        "vector": "vector",
        "point_cloud": "raster",
        "raster": "raster",
        "mesh": "raster",
        "city_model": "raster",
        "unknown": "raster",
    }
    return mapping.get(inferred_type, "raster")


def _format_data_kind_label(data_kind: str) -> str:
    return {
        "vector": "Vector",
        "point_cloud": "Point cloud",
        "raster": "Raster",
        "mesh": "Mesh",
        "city_model": "City model",
        "unknown": "Unknown",
    }.get(data_kind, data_kind.replace("_", " ").title())


def get_uploaded_dataset(dataset_name: str) -> dict[str, Any] | None:
    return get_catalog().get_uploaded_dataset_by_name(dataset_name)


def uploaded_dataset_schema(dataset_name: str) -> dict[str, Any] | None:
    dataset = get_uploaded_dataset(dataset_name)
    if not dataset:
        return None

    title = dataset.get("title") or dataset_name
    inferred_type = dataset.get("inferred_type", "unknown")
    detected_format = dataset.get("detected_format") or _suffix_no_dot(Path(dataset["primary_file"]))

    base_schema = {
        "type": "object",
        "title": f"{title} Upload Args",
        "properties": {
            "bounds": {
                "type": "array",
                "description": "Bounding box [minX, minY, maxX, maxY]",
                "items": {"type": "number"},
                "minItems": 4,
                "maxItems": 4,
            }
        },
        "required": ["bounds"],
    }

    if inferred_type == "vector":
        base_schema["properties"]["format"] = {
            "type": "string",
            "enum": ["geojson"],
            "default": "geojson",
            "description": "Download format",
        }
        return base_schema

    base_schema["properties"]["format"] = {
        "type": "string",
        "enum": [detected_format],
        "default": detected_format,
        "description": "Original uploaded format",
    }
    base_schema["properties"]["note"] = {
        "type": "string",
        "default": "Bounds are used to validate spatial overlap for uploaded datasets.",
    }
    return base_schema


def _bbox_intersects(a: list[float], b: list[float]) -> bool:
    return not (
        a[2] < b[0]  # a maxX < b minX
        or a[0] > b[2]  # a minX > b maxX
        or a[3] < b[1]  # a maxY < b minY
        or a[1] > b[3]  # a minY > b maxY
    )


def _normalize_bounds(bounds: Any) -> list[float] | None:
    if not isinstance(bounds, list) or len(bounds) < 4:
        return None
    try:
        return [
            float(bounds[0]),
            float(bounds[1]),
            float(bounds[2]),
            float(bounds[3]),
        ]
    except (TypeError, ValueError):
        return None


def process_uploaded_dataset_download(
    dataset_name: str,
    bounds: list[float],
    filename: str | None,
) -> tuple[bytes, str, str]:
    """
    Return (content_bytes, media_type, output_filename) for uploaded dataset.
    """
    dataset = get_uploaded_dataset(dataset_name)
    if not dataset:
        raise ValueError(f"Uploaded dataset '{dataset_name}' not found.")

    source_file = Path(dataset["primary_file"])
    inferred_type = dataset.get("inferred_type", "unknown")
    output_name = filename or dataset_name

    if len(bounds) != 4:
        raise ValueError("Bounds must be [minX, minY, maxX, maxY]")

    dataset_bounds = _normalize_bounds(dataset.get("bounds"))
    if dataset_bounds and not _bbox_intersects(dataset_bounds, bounds):
        raise ValueError(
            f"No data from '{dataset_name}' intersects the selected bounds."
        )

    if inferred_type == "vector":
        data = json.loads(source_file.read_text(encoding="utf-8"))
        clipped = clip_features_to_bounds(data, bounds)
        if not clipped.get("features"):
            raise ValueError(
                f"No vector features from '{dataset_name}' intersect the selected bounds."
            )
        return (
            json.dumps(clipped).encode("utf-8"),
            "application/geo+json",
            f"{output_name}.geojson",
        )

    media_type = dataset.get("metadata", {}).get("media_type") or _guess_media_type(source_file)
    ext = _suffix_no_dot(source_file)
    return (source_file.read_bytes(), media_type, f"{output_name}.{ext}")


def resolve_uploaded_job_result(
    dataset_name: str,
    params: dict[str, Any],
) -> tuple[bytes, str, str] | None:
    """Job worker helper for uploaded datasets."""
    dataset = get_uploaded_dataset(dataset_name)
    if not dataset:
        return None

    bounds = params.get("bounds") or []
    filename = params.get("filename")
    content, media_type, output_name = process_uploaded_dataset_download(
        dataset_name=dataset_name,
        bounds=bounds,
        filename=filename or dataset_name,
    )

    ext = Path(output_name).suffix.lstrip(".")
    if output_name.endswith(".json.zip"):
        ext = "json.zip"
    if not ext:
        ext = _suffix_no_dot(Path(dataset["primary_file"]))
    return (content, ext, media_type)


def _suffix_no_dot(path: Path) -> str:
    suffixes = path.suffixes
    if len(suffixes) >= 2 and "".join(suffixes[-2:]).lower() == ".json.zip":
        return "json.zip"
    return path.suffix.lstrip(".")


def _guess_media_type(path: Path) -> str:
    explicit = {
        ".geojson": "application/geo+json",
        ".json": "application/json",
        ".json.zip": "application/zip",
        ".obj": "model/obj",
        ".stl": "model/stl",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }
    ext = "".join(path.suffixes[-2:]).lower() if len(path.suffixes) >= 2 else path.suffix.lower()
    if ext in explicit:
        return explicit[ext]

    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def ensure_catalog_directories() -> None:
    Path(CATALOG_DATASETS_DIR).mkdir(parents=True, exist_ok=True)
