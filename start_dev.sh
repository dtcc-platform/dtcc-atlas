#!/bin/bash

# Start both FastAPI server and Vite dev server concurrently

# Store PIDs of background processes
FASTAPI_PID=""
VITE_PID=""
PIXEL_STREAMING_ENABLE="${PIXEL_STREAMING_ENABLE:-1}"
PIXEL_STREAMING_SFU_ENABLE="${PIXEL_STREAMING_SFU_ENABLE:-0}"

# Function to check if a port is in use and get the PID
get_pid_on_port() {
    local port=$1
    lsof -ti:$port 2>/dev/null
}

# Function to kill process on port
kill_process_on_port() {
    local port=$1
    local pid=$(get_pid_on_port $port)
    if [ -n "$pid" ]; then
        echo "Killing process $pid on port $port..."
        kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

# Function to handle cleanup on script exit
cleanup() {
    echo ""
    echo "Stopping servers..."

    if [[ "${PIXEL_STREAMING_ENABLE}" != "0" ]]; then
        echo "Stopping Pixel Streaming services..."
        bash scripts/pixel_streaming_stop.sh || true
    fi

    # Kill FastAPI server
    if [ -n "$FASTAPI_PID" ] && kill -0 $FASTAPI_PID 2>/dev/null; then
        echo "Stopping FastAPI server (PID: $FASTAPI_PID)..."
        kill $FASTAPI_PID 2>/dev/null
    fi

    # Kill Vite server
    if [ -n "$VITE_PID" ] && kill -0 $VITE_PID 2>/dev/null; then
        echo "Stopping Vite server (PID: $VITE_PID)..."
        kill $VITE_PID 2>/dev/null
    fi

    # Also clean up any remaining processes on the ports
    kill_process_on_port 8000
    kill_process_on_port 3000

    echo "Servers stopped."
}

trap cleanup EXIT INT TERM

# Check if frontend node_modules exists
if [ ! -d "frontend/node_modules" ]; then
    echo "node_modules not found in frontend directory."
    echo "Installing dependencies..."
    cd frontend && npm install && cd ..
    echo ""
fi

get_pixel_streaming_ports() {
    local url="${PIXEL_STREAMING_SIGNALING_URL:-}"
    local player_port=8888
    if [[ -n "${url}" ]]; then
        local hostport
        hostport=$(echo "${url}" | sed -E 's,^[a-z]+://([^/]+).*,\1,')
        local scheme
        scheme=$(echo "${url}" | sed -E 's,^(.*)://.*,\1,')
        local port="${hostport##*:}"
        if [[ "${port}" != "${hostport}" && -n "${port}" ]]; then
            player_port="${port}"
        else
            if [[ "${scheme}" == "wss" ]]; then
                player_port=443
            else
                player_port=80
            fi
        fi
    fi
    local streamer_port="${PIXEL_STREAMING_STREAMER_PORT:-$((player_port + 1))}"
    local sfu_port="${PIXEL_STREAMING_SFU_PORT:-$((player_port + 2))}"
    echo "${player_port} ${streamer_port} ${sfu_port}"
}

# Check if ports are already in use
PORT_8000_PID=$(get_pid_on_port 8000)
PORT_3000_PID=$(get_pid_on_port 3000)
PORT_PS_PLAYER_PID=""
PORT_PS_STREAMER_PID=""
PORT_PS_SFU_PID=""

if [[ "${PIXEL_STREAMING_ENABLE}" != "0" ]]; then
    read -r PS_PLAYER_PORT PS_STREAMER_PORT PS_SFU_PORT <<< "$(get_pixel_streaming_ports)"
    PORT_PS_PLAYER_PID=$(get_pid_on_port ${PS_PLAYER_PORT})
    PORT_PS_STREAMER_PID=$(get_pid_on_port ${PS_STREAMER_PORT})
    if [[ "${PIXEL_STREAMING_SFU_ENABLE}" == "1" ]]; then
        PORT_PS_SFU_PID=$(get_pid_on_port ${PS_SFU_PORT})
    fi
fi

if [ -n "$PORT_8000_PID" ] || [ -n "$PORT_3000_PID" ] || [ -n "$PORT_PS_PLAYER_PID" ] || [ -n "$PORT_PS_STREAMER_PID" ] || [ -n "$PORT_PS_SFU_PID" ]; then
    echo "Warning: One or more ports are already in use:"
    [ -n "$PORT_8000_PID" ] && echo "  - Port 8000 (PID: $PORT_8000_PID)"
    [ -n "$PORT_3000_PID" ] && echo "  - Port 3000 (PID: $PORT_3000_PID)"
    [ -n "$PORT_PS_PLAYER_PID" ] && echo "  - Pixel Streaming player port $PS_PLAYER_PORT (PID: $PORT_PS_PLAYER_PID)"
    [ -n "$PORT_PS_STREAMER_PID" ] && echo "  - Pixel Streaming streamer port $PS_STREAMER_PORT (PID: $PORT_PS_STREAMER_PID)"
    [ -n "$PORT_PS_SFU_PID" ] && echo "  - Pixel Streaming SFU port $PS_SFU_PORT (PID: $PORT_PS_SFU_PID)"
    echo ""
    read -p "Do you want to kill these processes and restart the servers? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        [ -n "$PORT_8000_PID" ] && kill_process_on_port 8000
        [ -n "$PORT_3000_PID" ] && kill_process_on_port 3000
        [ -n "$PORT_PS_PLAYER_PID" ] && kill_process_on_port $PS_PLAYER_PORT
        [ -n "$PORT_PS_STREAMER_PID" ] && kill_process_on_port $PS_STREAMER_PORT
        [ -n "$PORT_PS_SFU_PID" ] && kill_process_on_port $PS_SFU_PORT
    else
        echo "Exiting without starting servers."
        exit 1
    fi
fi

# Start Pixel Streaming services first
if [[ "${PIXEL_STREAMING_ENABLE}" != "0" ]]; then
    echo "Starting Pixel Streaming services..."
    bash scripts/pixel_streaming_start.sh
fi

# Start FastAPI server in development mode with auto-reload
echo "Starting FastAPI server on port 8000..."
uvicorn server.main:app --reload --host 0.0.0.0 --port 8000 &
FASTAPI_PID=$!
echo "FastAPI server started (PID: $FASTAPI_PID)"

# Start Vite dev server
echo "Starting Vite dev server on port 3000..."
cd frontend && npm run dev &
VITE_PID=$!
echo "Vite server started (PID: $VITE_PID)"

echo ""
echo "Both servers are running. Press Ctrl+C to stop."
echo ""

# Wait for all background processes
wait
