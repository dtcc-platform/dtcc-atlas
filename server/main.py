from dtcc_core import datasets
import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from typing import Dict, Any
import io

app = fastapi.FastAPI(title="DTCC Datsets Downloader", version="0.1.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
                "Content-Disposition": f"attachment; filename={filename}"
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