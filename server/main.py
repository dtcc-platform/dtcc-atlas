from dtcc_core import datasets

import dtcc_lod2_roofer

import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from typing import Dict, Any
import io
from pathlib import Path

app = fastapi.FastAPI(title="DTCC Datsets Downloader", version="0.1.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

available_datasets = datasets.list()
available_dataset_names = list(available_datasets.keys())
@app.get("/api/v1/datasets/list")
def list_datasets():

    return {"datasets": available_dataset_names}

@app.get("/api/v1/datasets/get_args/{dataset_name}")
def get_dataset_args(dataset_name: str):
    if dataset_name not in available_datasets:
        raise fastapi.HTTPException(status_code=404, detail="Dataset not found")
    dataset = available_datasets[dataset_name]
    return dataset.show_options()


class DatasetDownloadRequest(BaseModel):
    dataset: str
    bounds: list[float]
    parameters: Dict[str, Any]
    filename: str | None = None


@app.post("/api/v1/datasets/download")
def download_dataset(request: DatasetDownloadRequest):
    """
    Generate and download dataset based on parameters
    """
    if request.dataset not in available_datasets:
        raise fastapi.HTTPException(status_code=404, detail=f"Dataset '{request.dataset}' not found")

    dataset = available_datasets[request.dataset]

    # Merge bounds with parameters
    params = {
        "bounds": request.bounds,
        **request.parameters
    }


    print(f"Download request for dataset '{request.dataset}' with params: {params}")
    try:
        # Validate parameters using the dataset's ArgsModel
        _ = dataset.ArgsModel(**params)

        # Call the dataset with validated parameters as kwargs
        # The ArgsModel validation ensures the params are correct
        data = dataset(**params)

        # Determine file extension from format parameter or use default
        file_format = request.parameters.get("format", "bin")
        filename = request.filename
        if not filename:
            filename= request.dataset

        filename = f"{filename}.{file_format}"

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
        print(f"Returning file '{filename}' with content type '{content_type}'")
        # Return binary data as downloadable file
        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )

    except ValidationError as e:
        raise fastapi.HTTPException(
            status_code=422,
            detail=f"Invalid parameters: {e.errors()}"
        )
    except Exception as e:
        raise fastapi.HTTPException(
            status_code=500,
            detail=f"Error generating dataset: {str(e)}"
        )

# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        Serve the SPA for all routes not matched by API endpoints.
        This allows client-side routing to work properly.
        """
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