#!/bin/bash

# Start both FastAPI server and Vite dev server concurrently

# Store PIDs of background processes
FASTAPI_PID=""
VITE_PID=""

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

# Check if ports are already in use
PORT_8000_PID=$(get_pid_on_port 8000)
PORT_3000_PID=$(get_pid_on_port 3000)

if [ -n "$PORT_8000_PID" ] || [ -n "$PORT_3000_PID" ]; then
    echo "Warning: One or more ports are already in use:"
    [ -n "$PORT_8000_PID" ] && echo "  - Port 8000 (PID: $PORT_8000_PID)"
    [ -n "$PORT_3000_PID" ] && echo "  - Port 3000 (PID: $PORT_3000_PID)"
    echo ""
    read -p "Do you want to kill these processes and restart the servers? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        [ -n "$PORT_8000_PID" ] && kill_process_on_port 8000
        [ -n "$PORT_3000_PID" ] && kill_process_on_port 3000
    else
        echo "Exiting without starting servers."
        exit 1
    fi
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
