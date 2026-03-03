from dtcc_core import datasets

try:
   import dtcc_lod2_roofer
except ImportError:
    pass

try:
    import dtcc_sim.datasets
except ImportError:
    pass

import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from typing import Dict, Any
import io
from pathlib import Path
from contextlib import asynccontextmanager

from server.jobs import JobManager, create_jobs_router
from server.vector import create_vector_router, discover_published_datasets, get_dataset_metadata, get_dataset_geojson_path
from server.vector.routes import clip_features_to_bounds
from server.admin import create_admin_router
from server.upload import (
    create_upload_router,
    ensure_catalog_directories,
    get_catalog,
    list_uploaded_datasets_for_api,
    uploaded_dataset_schema,
    process_uploaded_dataset_download,
)
from server.session import create_session_router
from server.config import JOB_MAX_WORKERS, JOB_TIMEOUT
from server.middleware import SelectiveGZipMiddleware
import json

# Create job manager at module level so routes can be registered before catch-all
job_manager = JobManager(max_workers=JOB_MAX_WORKERS, job_timeout=JOB_TIMEOUT)
print(f"Job manager initialized with {JOB_MAX_WORKERS} workers, {JOB_TIMEOUT}s timeout")


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Manage application lifecycle - startup and shutdown."""
    ensure_catalog_directories()
    yield

    # Cleanup on shutdown
    if job_manager:
        job_manager.shutdown()
        print("Job manager shutdown complete")


app = fastapi.FastAPI(title="DTCC Atlas", version="0.1.0", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Session-Id"],
)

app.add_middleware(
    SelectiveGZipMiddleware,
    minimum_size=10000,
    skip_paths=("/api/v1/jobs/events",),
)

available_datasets = datasets.list()
available_dataset_names = list(available_datasets.keys())

_FORMAT_TO_KIND = {
    "tif": "raster",
    "tiff": "raster",
    "asc": "raster",
    "png": "raster",
    "jpg": "raster",
    "jpeg": "raster",
    "geojson": "vector",
    "json": "vector",
    "obj": "mesh",
    "stl": "mesh",
    "ply": "mesh",
    "vtk": "mesh",
    "vtu": "mesh",
    "xdmf": "mesh",
    "inp": "mesh",
    "bdf": "mesh",
    "las": "point_cloud",
    "laz": "point_cloud",
    "copc": "point_cloud",
    "cityjson": "city_model",
    "city.json": "city_model",
    "json.zip": "city_model",
}


def _source_group_for_dataset(dataset_obj: Any) -> tuple[str, str]:
    module_name = dataset_obj.__class__.__module__
    if module_name.startswith("dtcc_sim"):
        return ("dtcc-sim", "DTCC Sim")
    if module_name.startswith("dtcc_core"):
        return ("dtcc-core", "DTCC Core")
    return ("other", "Other")


def _normalize_formats(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip().lower() for v in value if str(v).strip()]
    return [str(value).strip().lower()] if str(value).strip() else []


def _extract_formats_from_format_property(format_prop: dict[str, Any]) -> list[str]:
    formats: list[str] = []

    if not isinstance(format_prop, dict):
        return formats

    formats.extend(_normalize_formats(format_prop.get("enum")))
    if "const" in format_prop:
        formats.extend(_normalize_formats(format_prop.get("const")))

    any_of = format_prop.get("anyOf")
    if isinstance(any_of, list):
        for variant in any_of:
            if not isinstance(variant, dict):
                continue
            formats.extend(_normalize_formats(variant.get("enum")))
            if "const" in variant:
                formats.extend(_normalize_formats(variant.get("const")))

    if not formats:
        formats.extend(_normalize_formats(format_prop.get("default")))

    deduped = []
    for fmt in formats:
        if fmt and fmt != "none" and fmt != "null" and fmt not in deduped:
            deduped.append(fmt)
    return deduped


def _dataset_schema_for_listing(dataset_obj: Any) -> dict[str, Any]:
    try:
        schema = dataset_obj.show_options()
        if isinstance(schema, dict):
            return schema
    except Exception:
        pass
    return {}


def _dataset_format_metadata(dataset_obj: Any) -> tuple[list[str], list[str], str, str]:
    schema = _dataset_schema_for_listing(dataset_obj)
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    format_prop = properties.get("format", {}) if isinstance(properties, dict) else {}

    formats = _extract_formats_from_format_property(format_prop)

    kinds: list[str] = []
    for fmt in formats:
        kind = _FORMAT_TO_KIND.get(fmt)
        if kind and kind not in kinds:
            kinds.append(kind)

    if not kinds and formats:
        kinds = ["unknown"]

    if len(kinds) == 1:
        data_kind = kinds[0]
    elif len(kinds) > 1:
        data_kind = "mixed"
    else:
        data_kind = "unknown"

    data_kind_label = {
        "vector": "Vector",
        "point_cloud": "Point cloud",
        "raster": "Raster",
        "mesh": "Mesh",
        "city_model": "City model",
        "mixed": "Format-dependent",
        "unknown": "Unknown",
    }.get(data_kind, "Unknown")

    ui_type = "vector" if kinds == ["vector"] else "raster"
    return (formats, kinds, data_kind, data_kind_label)


@app.get("/api/v1/datasets/list")
def list_datasets():
    """List all available datasets (dtcc-core + published + user-uploaded)."""
    # Start with dtcc datasets (including dtcc-sim registrations)
    all_datasets = []
    for name in available_dataset_names:
        dataset_obj = available_datasets[name]
        source_group, source_label = _source_group_for_dataset(dataset_obj)
        formats, return_types, data_kind, data_kind_label = _dataset_format_metadata(
            dataset_obj
        )
        all_datasets.append(
            {
                "name": name,
                "title": name.replace("_", " ").title(),
                "type": "vector" if return_types == ["vector"] else "raster",
                "source": source_group,
                "source_group": source_group,
                "source_label": source_label,
                "data_kind": data_kind,
                "data_kind_label": data_kind_label,
                "return_types": return_types,
                "supported_formats": formats,
            }
        )

    # Add published vector datasets
    published = discover_published_datasets()
    for dataset in published:
        dataset.setdefault("source_group", "published")
        dataset.setdefault("source_label", str(dataset.get("source", "Published")))
        dataset.setdefault("data_kind", "vector")
        dataset.setdefault("data_kind_label", "Vector")
        dataset.setdefault("return_types", ["vector"])
        dataset.setdefault("supported_formats", ["geojson"])
    all_datasets.extend(published)

    # Add uploaded datasets from catalog
    uploaded = list_uploaded_datasets_for_api()
    all_datasets.extend(uploaded)

    return {"datasets": all_datasets}


@app.get("/api/v1/datasets/get_args/{dataset_name}")
def get_dataset_args(dataset_name: str):
    """Get parameter schema for a dataset."""
    # Check dtcc-core datasets first
    if dataset_name in available_datasets:
        dataset = available_datasets[dataset_name]
        return dataset.show_options()

    # Check published vector datasets
    metadata = get_dataset_metadata(dataset_name)
    if metadata:
        return metadata.get("schema", {})

    # Check uploaded datasets
    uploaded_schema = uploaded_dataset_schema(dataset_name)
    if uploaded_schema:
        return uploaded_schema

    raise fastapi.HTTPException(status_code=404, detail="Dataset not found")


class DatasetDownloadRequest(BaseModel):
    dataset: str
    bounds: list[float]
    parameters: Dict[str, Any]
    filename: str | None = None


@app.post("/api/v1/datasets/download")
def download_dataset(request: DatasetDownloadRequest):
    """
    Generate and download dataset based on parameters.
    Handles both dtcc-core (raster) and published vector datasets.
    """
    # Check if it's a dtcc-core dataset
    if request.dataset in available_datasets:
        return _download_core_dataset(request)

    # Check if it's a published vector dataset
    geojson_path = get_dataset_geojson_path(request.dataset)
    if geojson_path:
        return _download_vector_dataset(request, geojson_path)

    # Check uploaded datasets
    try:
        content, media_type, filename = process_uploaded_dataset_download(
            dataset_name=request.dataset,
            bounds=request.bounds,
            filename=request.filename or request.dataset,
        )
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            pass
        else:
            raise fastapi.HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise fastapi.HTTPException(
            status_code=500, detail=f"Error serving uploaded dataset: {str(e)}"
        )

    # Dataset not found in known sources
    raise fastapi.HTTPException(
        status_code=404, detail=f"Dataset '{request.dataset}' not found"
    )


def _download_core_dataset(request: DatasetDownloadRequest):
    """Handle download for dtcc-core datasets."""
    dataset = available_datasets[request.dataset]

    # Merge bounds with parameters
    params = {"bounds": request.bounds, **request.parameters}

    print(f"Download request for dtcc-core dataset '{request.dataset}' with params: {params}")
    try:
        # Validate parameters using the dataset's ArgsModel
        _ = dataset.ArgsModel(**params)

        # Call the dataset with validated parameters as kwargs
        data = dataset(**params)

        # Determine file extension from format parameter or use default
        file_format = request.parameters.get("format", "bin")
        filename = request.filename
        if not filename:
            filename = request.dataset

        # Determine content type based on format
        content_type_map = {
            "tif": "image/tiff",
            "obj": "model/obj",
            "stl": "model/stl",
            "copc": "application/octet-stream",
            "las": "application/octet-stream",
            "laz": "application/octet-stream",
            "cityjson": "application/json",
            "json": "application/json",
        }
        content_type = content_type_map.get(file_format, "application/octet-stream")

        if file_format == "cityjson":
            file_format = "city.json"
        filename = f"{filename}.{file_format}"
        print(f"Returning file '{filename}' with content type '{content_type}'")

        return Response(
            content=data,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ValidationError as e:
        raise fastapi.HTTPException(
            status_code=422, detail=f"Invalid parameters: {e.errors()}"
        )
    except Exception as e:
        raise fastapi.HTTPException(
            status_code=500, detail=f"Error generating dataset: {str(e)}"
        )


def _download_vector_dataset(request: DatasetDownloadRequest, geojson_path: Path):
    """Handle download for published vector datasets."""
    print(f"Download request for vector dataset '{request.dataset}' with bounds: {request.bounds}")

    # Validate bounds
    if len(request.bounds) != 4:
        raise fastapi.HTTPException(
            status_code=422, detail="Bounds must be [minX, minY, maxX, maxY]"
        )

    try:
        # Load GeoJSON
        with open(geojson_path, "r", encoding="utf-8") as f:
            geojson = json.load(f)

        # Filter features to bounds
        filtered = clip_features_to_bounds(geojson, request.bounds)

        feature_count = len(filtered.get("features", []))
        print(f"Filtered to {feature_count} features within bounds")

        # Return as GeoJSON
        filename = request.filename or request.dataset
        return Response(
            content=json.dumps(filtered),
            media_type="application/geo+json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.geojson"'
            }
        )

    except (json.JSONDecodeError, IOError) as e:
        raise fastapi.HTTPException(
            status_code=500, detail=f"Error reading dataset: {e}"
        )


# Mount jobs router BEFORE the catch-all SPA route
jobs_router = create_jobs_router(job_manager)
app.include_router(jobs_router, prefix="/api/v1")

# Mount vector datasets router
vector_router = create_vector_router()
app.include_router(vector_router, prefix="/api/v1")
print("Vector datasets router mounted at /api/v1/vector")

# Mount admin router
admin_router = create_admin_router()
app.include_router(admin_router, prefix="/api/v1")
print("Admin router mounted at /api/v1/admin")

# Mount upload router
upload_router = create_upload_router()
app.include_router(upload_router, prefix="/api/v1")
print("Upload router mounted at /api/v1/uploads")

# Mount session router
session_router = create_session_router(get_catalog())
app.include_router(session_router, prefix="/api/v1")
print("Session router mounted at /api/v1/sessions")


# Mount static files (must be last due to catch-all route)
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        Serve the SPA for all routes not matched by API endpoints.
        This allows client-side routing to work properly.
        """
        # Serve admin panel for /admin or /admin/
        if full_path in ("admin", "admin/"):
            admin_path = static_dir / "admin.html"
            if admin_path.exists():
                return FileResponse(admin_path)

        # If path looks like a file request, try to serve it
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # Otherwise, serve index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        raise fastapi.HTTPException(status_code=404, detail="Not found")
else:
    print("Warning: Static directory not found, SPA will not be served.")
