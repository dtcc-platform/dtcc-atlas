# DTCC Atlas

Interactive web app for browsing/downloading DTCC datasets.

## Quick Start (Development)

### Prerequisites
- A Python environment (`venv`, `conda`, `uv`, etc.) with:
  - `dtcc-core`
  - `fastapi`
  - `uvicorn`
- Optional: `dtcc-sim` (for simulation-related datasets)
- Node.js + npm

### 1) Activate your Python environment

Use your preferred environment manager.

Example (`venv`):

```bash
source .venv/bin/activate
```

Example (`conda`, common when including `dtcc-sim`):

```bash
source ~/miniconda3/bin/activate
conda activate fenicsx-env
```

### 2) Start Atlas

```bash
cd /Users/logg/scratch/dtcc/dtcc-atlas
./start_dev.sh
```

Open:
- Frontend (hot reload): http://localhost:3000
- Backend API: http://localhost:8000

Notes:
- On first run, frontend dependencies are installed automatically (`frontend/node_modules`).
- If ports `3000` or `8000` are in use, the script asks whether to stop existing processes.
- Stop both servers with `Ctrl+C`.

## One-Time Python Package Setup (if needed)

Install missing backend packages into your active environment:

```bash
pip install "fastapi>=0.125.0" "uvicorn>=0.38.0"
```

Optional (`dtcc-sim` support):

```bash
pip install dtcc-sim
```

## Production Mode

Build frontend and serve from FastAPI:

```bash
cd /Users/logg/scratch/dtcc/dtcc-atlas
./build_and_start.sh
```

Open: http://localhost:8000
