# Pixel Streaming Service

This module runs Epic Pixel Streaming infrastructure (UE5.7) on a dedicated VM.

## Setup
1. Initialize the submodule:
   ```
   git submodule update --init --recursive services/pixel_streaming/PixelStreamingInfrastructure
   ```
2. Configure the parameters in config.env
3. Start the service:
   ```Linux/MacOS
   ./services/pixel_streaming/scripts/start.sh
   ```
   ```Powershell
   ./start.ps1
   ```

Logs are written to `services/pixel_streaming/temp/pixel_streaming_logs`.

## Ports

Defaults:
- Player (frontend): `8888`
- Streamer (Unreal): `8889`
- SFU: `8890` (disabled unless `PIXEL_STREAMING_SFU_ENABLE=1`)

Unreal example:
```
-PixelStreamingURL=ws://<vm-host>:8889
```

## Frontend configuration

In `dtcc-dataset-downloader` frontend, set:

```
VITE_PIXEL_STREAMING_SIGNALING_URL=ws://<vm-host>:8888
```

Infrastructure control (used by `services/pixel_streaming/scripts/start.sh` and `start.ps1`):
- `PIXEL_STREAMING_SIGNALING_URL` (optional) to set the player URL used by scripts
- `PIXEL_STREAMING_STREAMER_PORT` (optional) defaults to `PLAYER_PORT + 1`
- `PIXEL_STREAMING_SFU_PORT` (optional) defaults to `PLAYER_PORT + 2`
- `PIXEL_STREAMING_TURN_ENABLE=1` to start TURN (disabled by default in dev)
- `PIXEL_STREAMING_SFU_ENABLE=1` to start SFU (disabled by default)
- `PIXEL_STREAMING_NO_SUDO=1` (default) to avoid sudo prompts when starting services
- `PIXEL_STREAMING_CONFIG_FILE` to point to a custom config file (default `services/pixel_streaming/config.env`)

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