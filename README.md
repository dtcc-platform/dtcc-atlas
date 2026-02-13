# DTCC Atlas

Interactive web application for downloading DTCC datasets using a map interface.

## Quick Start

### Development Mode
Start both the FastAPI backend and Vite frontend dev servers:

```bash
./start_dev.sh
```

- Frontend: http://localhost:3000 (with hot reload)
- Backend API: http://localhost:8000

### Production Mode
Build the frontend and serve everything from the FastAPI server:

```bash
./build_and_start.sh
```

- Application: http://localhost:8000

## Requirements

- Python >=3.12 (uses uv for dependency management)
- Node.js (for frontend build)

## What the Scripts Do

- `start_dev.sh`: Checks for dependencies, handles port conflicts, starts both servers concurrently
- `build_and_start.sh`: Builds frontend, copies static files to `server/static/`, starts FastAPI server