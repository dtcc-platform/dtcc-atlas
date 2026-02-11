#!/bin/bash

set -euo pipefail

MODULE_DIR="$(cd -P -- "$(dirname -- "$0")/.." && pwd -P)"
PS_ROOT="${MODULE_DIR}/PixelStreamingInfrastructure"
PID_FILE="${MODULE_DIR}/temp/pixel_streaming.pids"
CONFIG_FILE="${PIXEL_STREAMING_CONFIG_FILE:-${MODULE_DIR}/config.env}"

if [[ -f "${CONFIG_FILE}" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
    key="$(echo "${key}" | xargs)"
    value="$(echo "${value}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [[ -z "${!key-}" ]]; then
      export "${key}=${value}"
    fi
  done < "${CONFIG_FILE}"
fi

PIXEL_STREAMING_TURN_ENABLE="${PIXEL_STREAMING_TURN_ENABLE:-0}"
PIXEL_STREAMING_SFU_ENABLE="${PIXEL_STREAMING_SFU_ENABLE:-0}"
PIXEL_STREAMING_SIGNALING_URL="${PIXEL_STREAMING_SIGNALING_URL:-}"
PIXEL_STREAMING_NO_SUDO="${PIXEL_STREAMING_NO_SUDO:-1}"

if [[ ! -d "${PS_ROOT}" ]]; then
  echo "PixelStreamingInfrastructure not found at ${PS_ROOT}."
  echo "Run: git submodule update --init --recursive"
  exit 1
fi

LOG_DIR="${MODULE_DIR}/temp/pixel_streaming_logs"

mkdir -p "${MODULE_DIR}/temp"
mkdir -p "${LOG_DIR}"
echo -n "" > "${PID_FILE}"

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

PLAYER_URL="${SIGNALING_SCHEME}://${SIGNALING_HOST}:${PLAYER_PORT}"
SFU_SIGNALING_URL="${SIGNALING_SCHEME}://${SIGNALING_HOST}:${SFU_PORT}"

echo "Starting Pixel Streaming services..."
echo "  Player URL     : ${PLAYER_URL}"
echo "  Player port    : ${PLAYER_PORT}"
echo "  Streamer port  : ${STREAMER_PORT}"
if [[ "${PIXEL_STREAMING_SFU_ENABLE}" == "1" ]]; then
  echo "  SFU port       : ${SFU_PORT}"
else
  echo "  SFU            : disabled"
fi
echo "  TURN enabled   : ${PIXEL_STREAMING_TURN_ENABLE}"

start_background_in_dir() {
  local name="$1"
  local dir="$2"
  shift 2

  (cd "${dir}" && "$@") &
  local pid=$!
  echo "${pid}:${name}" >> "${PID_FILE}"
}

SIGNALLING_SCRIPT="${PS_ROOT}/SignallingWebServer/platform_scripts/bash/start.sh"
SIGNALLING_TURN_SCRIPT="${PS_ROOT}/SignallingWebServer/platform_scripts/bash/start_with_turn.sh"
SFU_SCRIPT="${PS_ROOT}/SFU/platform_scripts/bash/run_local.sh"

SIGNALLING_ARGS=()
SFU_ARGS=()
if [[ "${PIXEL_STREAMING_NO_SUDO}" == "1" ]]; then
  SIGNALLING_ARGS+=(--nosudo)
  SFU_ARGS+=(--nosudo)
fi
SIGNALLING_ARGS+=(-- --player_port "${PLAYER_PORT}" --streamer_port "${STREAMER_PORT}" --sfu_port "${SFU_PORT}" --log_folder "${LOG_DIR}")

if [[ "${PIXEL_STREAMING_TURN_ENABLE}" == "1" ]]; then
  start_background_in_dir "signalling" "${PS_ROOT}/SignallingWebServer" bash "${SIGNALLING_TURN_SCRIPT}" "${SIGNALLING_ARGS[@]}"
else
  start_background_in_dir "signalling" "${PS_ROOT}/SignallingWebServer" bash "${SIGNALLING_SCRIPT}" "${SIGNALLING_ARGS[@]}"
fi

if [[ "${PIXEL_STREAMING_SFU_ENABLE}" == "1" ]]; then
  start_background_in_dir "sfu" "${PS_ROOT}/SFU" bash "${SFU_SCRIPT}" "${SFU_ARGS[@]}" --signallingURL="${SFU_SIGNALING_URL}"
fi

echo "Pixel Streaming processes started. PID file: ${PID_FILE}"
