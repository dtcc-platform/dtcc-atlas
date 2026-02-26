"""Upload module for user-provided dataset ingestion."""

from __future__ import annotations

from typing import Any


def create_upload_router():
    from .routes import create_upload_router as _create_upload_router

    return _create_upload_router()


def ensure_catalog_directories() -> None:
    from .service import ensure_catalog_directories as _ensure_catalog_directories

    _ensure_catalog_directories()


def get_uploaded_dataset(dataset_name: str) -> dict[str, Any] | None:
    from .service import get_uploaded_dataset as _get_uploaded_dataset

    return _get_uploaded_dataset(dataset_name)


def list_uploaded_datasets_for_api() -> list[dict[str, Any]]:
    from .service import list_uploaded_datasets_for_api as _list_uploaded_datasets_for_api

    return _list_uploaded_datasets_for_api()


def process_uploaded_dataset_download(
    dataset_name: str,
    bounds: list[float],
    filename: str | None,
) -> tuple[bytes, str, str]:
    from .service import process_uploaded_dataset_download as _process_uploaded_dataset_download

    return _process_uploaded_dataset_download(dataset_name, bounds, filename)


def resolve_uploaded_job_result(
    dataset_name: str,
    params: dict[str, Any],
) -> tuple[bytes, str, str] | None:
    from .service import resolve_uploaded_job_result as _resolve_uploaded_job_result

    return _resolve_uploaded_job_result(dataset_name, params)


def uploaded_dataset_schema(dataset_name: str) -> dict[str, Any] | None:
    from .service import uploaded_dataset_schema as _uploaded_dataset_schema

    return _uploaded_dataset_schema(dataset_name)


__all__ = [
    "create_upload_router",
    "ensure_catalog_directories",
    "get_uploaded_dataset",
    "list_uploaded_datasets_for_api",
    "process_uploaded_dataset_download",
    "resolve_uploaded_job_result",
    "uploaded_dataset_schema",
]
