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

This repo vendors the Epic PixelStreamingInfrastructure as a git submodule and runs its Node services alongside the app.
Initialize the submodule once:

```bash
git submodule update --init --recursive
```

Frontend pixel streaming uses the Epic UE 5.7 frontend library. Configure the **player** signaling URL via:

- `VITE_PIXEL_STREAMING_SIGNALING_URL` (example: `wss://your-signaling-host:8888`)
- `VITE_PIXEL_STREAMING_STREAMER_ID` (optional, e.g. `Editor`) to auto-select the streamer when multiple are present

If unset, the frontend falls back to `ws(s)://<current-hostname>:8888`.
See `frontend/.env.example` for the expected variable name.

Infrastructure control (used by `start_dev.sh` / `build_and_start.sh`):

- `PIXEL_STREAMING_ENABLE=1` (default) to start Signalling + SFU
- `PIXEL_STREAMING_SIGNALING_URL` (optional) to set the player URL used by scripts
- `PIXEL_STREAMING_STREAMER_PORT` (optional) defaults to `PLAYER_PORT + 1`
- `PIXEL_STREAMING_SFU_PORT` (optional) defaults to `PLAYER_PORT + 2`
- `PIXEL_STREAMING_TURN_ENABLE=1` to start TURN (disabled by default in dev)
- `PIXEL_STREAMING_SFU_ENABLE=1` to start SFU (disabled by default)
- `PIXEL_STREAMING_NO_SUDO=1` (default) to avoid sudo prompts when starting services

Default ports (when `PIXEL_STREAMING_SIGNALING_URL` is unset):

- Player (frontend): `8888`
- Streamer (Unreal): `8889`
- SFU: `8890`

Unreal example (streamer port):

```bash
-PixelStreamingURL=ws://<host>:8889
```

If you override the player port, the streamer + SFU ports will follow unless you set
`PIXEL_STREAMING_STREAMER_PORT` / `PIXEL_STREAMING_SFU_PORT` explicitly.
If `PIXEL_STREAMING_SIGNALING_URL` is set without an explicit port, the scripts default
to `80` for `ws://` and `443` for `wss://`.

## What the Scripts Do

- `start_dev.sh`: Checks for dependencies, handles port conflicts, starts Pixel Streaming + both servers concurrently
- `build_and_start.sh`: Builds frontend, copies static files to `server/static/`, starts Pixel Streaming + FastAPI server
