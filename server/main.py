from dtcc_core import datasets

try:
   import dtcc_lod2_roofer
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
from server.config import JOB_MAX_WORKERS, JOB_TIMEOUT
from server.middleware import SelectiveGZipMiddleware
import json

# Create job manager at module level so routes can be registered before catch-all
job_manager = JobManager(max_workers=JOB_MAX_WORKERS, job_timeout=JOB_TIMEOUT)
print(f"Job manager initialized with {JOB_MAX_WORKERS} workers, {JOB_TIMEOUT}s timeout")


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Manage application lifecycle - startup and shutdown."""
    yield

    # Cleanup on shutdown
    if job_manager:
        job_manager.shutdown()
        print("Job manager shutdown complete")


app = fastapi.FastAPI(title="DTCC Datsets Downloader", version="0.1.0", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.add_middleware(
    SelectiveGZipMiddleware,
    minimum_size=10000,
    skip_paths=("/api/v1/jobs/events",),
)

available_datasets = datasets.list()
available_dataset_names = list(available_datasets.keys())


@app.get("/api/v1/datasets/list")
def list_datasets():
    """List all available datasets (dtcc-core + published vector datasets)."""
    # Start with dtcc-core datasets
    all_datasets = [
        {"name": name, "type": "raster", "source": "dtcc-core"}
        for name in available_dataset_names
    ]

    # Add published vector datasets
    published = discover_published_datasets()
    all_datasets.extend(published)

    return {"datasets": all_datasets}


@app.get("/api/v1/datasets/get_args/{dataset_name}")
def get_dataset_args(dataset_name: str):
    """Get parameter schema for a dataset (dtcc-core or published vector)."""
    # Check dtcc-core datasets first
    if dataset_name in available_datasets:
        dataset = available_datasets[dataset_name]
        return dataset.show_options()

    # Check published vector datasets
    metadata = get_dataset_metadata(dataset_name)
    if metadata:
        return metadata.get("schema", {})

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

    # Dataset not found in either source
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
