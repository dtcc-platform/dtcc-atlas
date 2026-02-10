#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd -P -- "$(dirname -- "$0")/.." && pwd -P)"
PID_FILE="${ROOT_DIR}/temp/pixel_streaming.pids"

PIXEL_STREAMING_ENABLE="${PIXEL_STREAMING_ENABLE:-1}"
PIXEL_STREAMING_SIGNALING_URL="${PIXEL_STREAMING_SIGNALING_URL:-}"
PIXEL_STREAMING_SFU_ENABLE="${PIXEL_STREAMING_SFU_ENABLE:-0}"

if [[ "${PIXEL_STREAMING_ENABLE}" == "0" ]]; then
  exit 0
fi

if [[ -f "${PID_FILE}" ]]; then
  while IFS=: read -r pid name; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Stopping Pixel Streaming ${name} (PID: ${pid})..."
      kill "${pid}" 2>/dev/null || true
    fi
  done < "${PID_FILE}"

  sleep 1

  while IFS=: read -r pid name; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Force stopping Pixel Streaming ${name} (PID: ${pid})..."
      kill -9 "${pid}" 2>/dev/null || true
    fi
  done < "${PID_FILE}"

  rm -f "${PID_FILE}"
fi

SIGNALING_SCHEME="ws"
SIGNALING_HOST="localhost"
PLAYER_PORT="8888"

if [[ -n "${PIXEL_STREAMING_SIGNALING_URL}" ]]; then
  SIGNALING_SCHEME="$(echo "${PIXEL_STREAMING_SIGNALING_URL}" | sed -E 's,^(.*)://.*,\1,')"
  SIGNALING_HOSTPORT="$(echo "${PIXEL_STREAMING_SIGNALING_URL}" | sed -E 's,^[a-z]+://([^/]+).*,\1,')"
  SIGNALING_HOST="${SIGNALING_HOSTPORT%%:*}"
  SIGNALING_PORT="${SIGNALING_HOSTPORT##*:}"
  if [[ "${SIGNALING_PORT}" != "${SIGNALING_HOSTPORT}" && -n "${SIGNALING_PORT}" ]]; then
    PLAYER_PORT="${SIGNALING_PORT}"
  else
    if [[ "${SIGNALING_SCHEME}" == "wss" ]]; then
      PLAYER_PORT="443"
    else
      PLAYER_PORT="80"
    fi
  fi
fi

STREAMER_PORT="${PIXEL_STREAMING_STREAMER_PORT:-$((PLAYER_PORT + 1))}"
SFU_PORT="${PIXEL_STREAMING_SFU_PORT:-$((PLAYER_PORT + 2))}"

PORTS=("${PLAYER_PORT}" "${STREAMER_PORT}")
if [[ "${PIXEL_STREAMING_SFU_ENABLE}" == "1" ]]; then
  PORTS+=("${SFU_PORT}")
fi

for port in "${PORTS[@]}"; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      echo "Cleaning up processes on port ${port}: ${pids}"
      kill ${pids} 2>/dev/null || true
    fi
  fi
done
