"""
Discovery of published vector datasets.

Scans the published directory for datasets and their metadata.
"""

import json
from pathlib import Path
from typing import Optional

from server.config import PUBLISHED_DATASETS_DIR
from server.datasets.manifest_v2 import ManifestV2Error, load_manifest_v2, manifest_v2_summary


def discover_published_datasets(published_dir: Path | None = None) -> list[dict]:
    """
    Discover all published vector datasets.

    Reads the datasets.json index file if available, otherwise scans
    subdirectories for metadata.json files.

    Args:
        published_dir: Directory containing published datasets

    Returns:
        List of dataset info dicts with name, title, type, source, path
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    published_dir = Path(published_dir)

    if not published_dir.exists():
        return []

    # Try reading the index file first
    index_path = published_dir / "datasets.json"
    if index_path.exists():
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index = json.load(f)
            return index.get("datasets", [])
        except (json.JSONDecodeError, IOError):
            pass

    # Fall back to scanning directories
    datasets = []
    for subdir in published_dir.iterdir():
        if not subdir.is_dir():
            continue

        manifest_path = subdir / "manifest.json"
        if manifest_path.exists():
            try:
                summary = manifest_v2_summary(load_manifest_v2(manifest_path))
                identity = summary["identity"]
                datasets.append({
                    "name": subdir.name,
                    "title": summary.get("title") or identity.get("name") or subdir.name,
                    "type": "dataset_manifest_v3" if summary["schema_version"].endswith("-v3") else "dataset_manifest_v2",
                    "schema_version": summary["schema_version"],
                    "source": "dtcc-upload",
                    "path": f"{subdir.name}/",
                    "bounds": summary.get("bounds"),
                    "manifest": "manifest.json",
                    "artifacts": summary["artifacts"],
                    "display_artifact": summary["display_artifact"],
                    "metadata": summary["metadata"],
                    "presentation": summary["presentation"],
                    "request": summary["request"],
                    "supported_formats": summary["supported_formats"],
                    "data_kind": summary["display_artifact"]["data_kind"] if summary["display_artifact"] else "model",
                    "return_types": list(dict.fromkeys(a["data_kind"] for a in summary["artifacts"])),
                })
                continue
            except ManifestV2Error:
                continue

        metadata_path = subdir / "metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                datasets.append({
                    "name": metadata.get("name", subdir.name),
                    "title": metadata.get("title", subdir.name),
                    "type": "vector",
                    "source": metadata.get("source", "lm-geotorget"),
                    "path": f"{subdir.name}/",
                    "bounds": metadata.get("bounds"),
                })
            except (json.JSONDecodeError, IOError):
                continue

    return datasets


def get_dataset_metadata(dataset_name: str, published_dir: Path | None = None) -> Optional[dict]:
    """
    Get full metadata for a specific dataset.

    Args:
        dataset_name: Name of the dataset
        published_dir: Directory containing published datasets

    Returns:
        Metadata dict or None if not found
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    published_dir = Path(published_dir)
    if not dataset_name or Path(dataset_name).name != dataset_name or dataset_name.startswith('.'):
        return None
    manifest_path = published_dir / dataset_name / "manifest.json"
    if manifest_path.is_file():
        return manifest_v2_summary(load_manifest_v2(manifest_path))
    metadata_path = published_dir / dataset_name / "metadata.json"

    if not metadata_path.exists():
        return None

    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def get_dataset_artifact(dataset_name: str, format: str | None = None, published_dir: Path | None = None):
    """Resolve a stored package artifact for download, validating its package.

    The directory name addresses the published dataset. With no format, select
    its supported display derivative. Explicit ``dtcc`` selects the native model.
    """
    if not dataset_name or Path(dataset_name).name != dataset_name or dataset_name.startswith('.'):
        return None
    root = Path(published_dir or PUBLISHED_DATASETS_DIR).resolve()
    package_dir = (root / dataset_name).resolve()
    if not package_dir.is_relative_to(root):
        return None
    manifest_path = package_dir / "manifest.json"
    if not manifest_path.is_file():
        return None
    manifest = load_manifest_v2(manifest_path)
    if manifest["schema_version"] == "dtcc-dataset-manifest-v3":
        from dtcc_core.datasets import load_model_package
        try:
            # Decode and validate at artifact consumption, not on every catalogue
            # listing. Core owns numerical/semantic and package integrity checks.
            load_model_package(package_dir)
        except (ValueError, TypeError, NotImplementedError) as error:
            raise ManifestV2Error(f"Invalid canonical package: {error}") from error
    if format:
        matches = [a for a in manifest["artifacts"] if a["format"] == format]
        if len(matches) != 1:
            raise ManifestV2Error(f"Package has no unique artifact for format {format!r}")
        artifact = matches[0]
    else:
        summary = manifest_v2_summary(manifest)
        artifact = summary["display_artifact"]
        if artifact is None:
            artifact = next(a for a in manifest["artifacts"] if a["role"] == "canonical_model")
    path = (package_dir / artifact["path"]).resolve()
    if not path.is_relative_to(package_dir) or not path.is_file():
        raise ManifestV2Error("Package artifact is missing or outside its directory")
    return path, artifact


def get_dataset_geojson_path(dataset_name: str, published_dir: Path | None = None) -> Optional[Path]:
    """
    Get path to the GeoJSON data file for a dataset.

    Args:
        dataset_name: Name of the dataset
        published_dir: Directory containing published datasets

    Returns:
        Path to data.geojson or None if not found
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    if not dataset_name or Path(dataset_name).name != dataset_name or dataset_name.startswith('.'):
        return None

    published_dir = Path(published_dir)
    geojson_path = published_dir / dataset_name / "data.geojson"

    if geojson_path.exists():
        return geojson_path

    return None
