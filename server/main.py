from dtcc_core import datasets
import fastapi
from fastapi.middleware.cors import CORSMiddleware

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
        return fastapi.HTTPException(status_code=404, detail="Dataset not found")
    dataset = available_datasets[dataset_name]
    return dataset.show_options()