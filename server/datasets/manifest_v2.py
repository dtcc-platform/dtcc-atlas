"""Dataset Manifest v2 parsing and artifact selection helpers."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any, Mapping


MANIFEST_V2_SCHEMA_VERSION = "dtcc-dataset-manifest-v2"
WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")


class ManifestV2Error(ValueError):
    """Raised when a Dataset Manifest v2 package is invalid for Atlas."""


def load_manifest_v2(path: str | Path) -> dict[str, Any]:
    manifest_path = Path(path)
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestV2Error(f"Unable to read Dataset Manifest v2 JSON: {manifest_path}") from exc
    if not isinstance(payload, dict):
        raise ManifestV2Error("Dataset Manifest v2 must be a JSON object")
    validate_manifest_v2(payload)
    return payload


def validate_manifest_v2(manifest: Mapping[str, Any]) -> None:
    if manifest.get("schema_version") != MANIFEST_V2_SCHEMA_VERSION:
        raise ManifestV2Error(
            f"Dataset Manifest v2 schema_version must be {MANIFEST_V2_SCHEMA_VERSION!r}"
        )
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise ManifestV2Error("Dataset Manifest v2 must include non-empty artifacts")

    seen_paths: set[str] = set()
    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, Mapping):
            raise ManifestV2Error(f"Manifest artifact {index} must be an object")
        path = _required_artifact_string(artifact, "path", index)
        validate_artifact_path(path)
        for field in ("role", "format", "media_type", "data_kind"):
            _required_artifact_string(artifact, field, index)
        if path in seen_paths:
            raise ManifestV2Error(f"Duplicate artifact path: {path}")
        seen_paths.add(path)


def validate_artifact_path(path: str) -> str:
    if not isinstance(path, str) or not path:
        raise ManifestV2Error("Invalid artifact path")
    if path.startswith("/") or path.startswith("."):
        raise ManifestV2Error("Invalid artifact path")
    if WINDOWS_DRIVE_RE.match(path):
        raise ManifestV2Error("Invalid artifact path")
    if "\\" in path or "\x00" in path or "//" in path:
        raise ManifestV2Error("Invalid artifact path")
    if any(ord(char) < 32 or ord(char) == 127 for char in path):
        raise ManifestV2Error("Invalid artifact path")
    for part in path.split("/"):
        if not part or part in {".", ".."} or part.startswith("."):
            raise ManifestV2Error("Invalid artifact path")
    return path


def select_display_artifact(manifest: Mapping[str, Any]) -> dict[str, Any]:
    validate_manifest_v2(manifest)
    artifacts = manifest["artifacts"]
    candidates: list[tuple[int, int, Mapping[str, Any]]] = []
    for index, artifact in enumerate(artifacts):
        assert isinstance(artifact, Mapping)
        media_type = str(artifact["media_type"])
        role = str(artifact["role"])
        rank = _display_rank(media_type, role)
        if rank is None:
            continue
        candidates.append((rank, index, artifact))

    if not candidates:
        raise ManifestV2Error(
            "Dataset Manifest v2 has no displayable image/png, video/mp4, or GeoJSON artifact"
        )

    _, _, selected = min(candidates, key=lambda item: (item[0], item[1]))
    return dict(selected)


def manifest_v2_summary(manifest: Mapping[str, Any]) -> dict[str, Any]:
    display_artifact = select_display_artifact(manifest)
    identity = manifest.get("identity") if isinstance(manifest.get("identity"), Mapping) else {}
    metadata = manifest.get("metadata") if isinstance(manifest.get("metadata"), Mapping) else {}
    presentation = (
        manifest.get("presentation") if isinstance(manifest.get("presentation"), Mapping) else {}
    )
    request = manifest.get("request") if isinstance(manifest.get("request"), Mapping) else {}
    title = _first_text(identity.get("title"), presentation.get("headline"), identity.get("name"))
    description = _first_text(metadata.get("description"), presentation.get("summary"))
    bounds = display_artifact.get("bounds") if _is_bbox(display_artifact.get("bounds")) else request.get("bounds")

    return {
        "schema_version": MANIFEST_V2_SCHEMA_VERSION,
        "identity": dict(identity),
        "metadata": dict(metadata),
        "presentation": dict(presentation),
        "request": dict(request),
        "title": title,
        "description": description,
        "bounds": bounds if _is_bbox(bounds) else None,
        "artifacts": [dict(artifact) for artifact in manifest["artifacts"]],
        "display_artifact": display_artifact,
    }


def _required_artifact_string(
    artifact: Mapping[str, Any],
    field: str,
    index: int,
) -> str:
    value = artifact.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ManifestV2Error(f"Manifest artifact {index} must include {field}")
    return value.strip()


def _display_rank(media_type: str, role: str) -> int | None:
    primary = role == "primary"
    if media_type == "image/png":
        return 0 if primary else 3
    if media_type == "video/mp4":
        return 1 if primary else 4
    if media_type in {"application/geo+json", "application/json"}:
        return 2 if primary else 5
    return None


def _first_text(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _is_bbox(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 4
        and all(
            isinstance(item, (int, float))
            and not isinstance(item, bool)
            and math.isfinite(float(item))
            for item in value
        )
    )
