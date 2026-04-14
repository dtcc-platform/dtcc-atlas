# DTCC Atlas

Interactive web app for browsing/downloading DTCC datasets.

## Quick Start (Development)

### Prerequisites
- A Python environment (`venv`, `conda`, `uv`, etc.) with:
  - `dtcc-core`
  - `fastapi`
  - `uvicorn`
- Node.js + npm
- Optional: a running `dtcc-sim` mini-service (for simulation-related datasets)

### 1) Activate your Python environment

Use your preferred environment manager.

Example (`venv`):

```bash
source .venv/bin/activate
```

Example (`conda`):

```bash
source ~/miniconda3/bin/activate
conda activate fenicsx-env
```

### 2) Start Atlas

```bash
cd /path/to/dtcc-atlas
./start_dev.sh
```

Open:
- Frontend (hot reload): http://localhost:3000
- Backend API: http://localhost:8000

Notes:
- On first run, frontend dependencies are installed automatically (`frontend/node_modules`).
- If ports `3000` or `8000` are in use, the script asks whether to stop existing processes.
- Stop both servers with `Ctrl+C`.

### 3) Optional: Connect a local `dtcc-sim` mini-service

If `dtcc-sim` is running locally on port `8001`, point Atlas at it before
starting the backend:

```bash
cd /path/to/dtcc-atlas
export DTCC_REMOTE_SERVICES=http://localhost:8001
./start_dev.sh
```

Notes:
- Start `dtcc-sim` before Atlas.
- Atlas registers remote services at startup, so restart Atlas if `dtcc-sim`
  comes up later.
- Without `DTCC_REMOTE_SERVICES`, Atlas still works with `dtcc-core` datasets.

## One-Time Python Package Setup (if needed)

Install missing backend packages into your active environment:

```bash
pip install "fastapi>=0.125.0" "uvicorn>=0.38.0"
```

## Production Mode

Build frontend and serve from FastAPI:

```bash
cd /path/to/dtcc-atlas
./build_and_start.sh
```

Note: `build_and_start.sh` currently runs FastAPI via `conda run -n fenicsx-env`.

Open: http://localhost:8000
