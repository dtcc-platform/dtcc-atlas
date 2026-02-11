# DTCC Dataset Downloader

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

## Pixel Streaming

Pixel Streaming runs as a **separate service** on a dedicated VM under `services/pixel_streaming/`.
See `services/pixel_streaming/README.md` for VM setup instructions.
Initialize the submodule once (on the VM):

```bash
git submodule update --init --recursive services/pixel_streaming/PixelStreamingInfrastructure
```

Frontend pixel streaming uses the Epic UE 5.7 frontend library. Configure the **player** signaling URL via:

- `VITE_PIXEL_STREAMING_SIGNALING_URL` (example: `wss://your-signaling-host:8888`)
- `VITE_PIXEL_STREAMING_STREAMER_ID` (optional, e.g. `Editor`) to auto-select the streamer when multiple are present

If unset, the frontend falls back to `ws(s)://<current-hostname>:8888`, which is only
useful if you are running Pixel Streaming on the same host.
See `frontend/.env.local` for the expected variable name.

For more information on Pixel Streaming check `services/pixel_streaming/README.md`.

## What the Scripts Do

- `start_dev.sh`: Checks for dependencies, handles port conflicts, starts FastAPI + Vite servers
- `build_and_start.sh`: Builds frontend, copies static files to `server/static/`, starts FastAPI server
