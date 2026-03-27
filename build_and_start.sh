#!/bin/bash

# Exit on error
set -e

# Check if node_modules exists, if not run npm install
if [ ! -d "frontend/node_modules" ]; then
    echo "node_modules not found, running npm install..."
    cd frontend
    npm install
    cd ..
fi

echo "Building frontend..."
cd frontend
npm run build
cd ..

# Vite outputs directly to server/static/ (configured in vite.config.ts)
# No copy step needed.

echo "Starting FastAPI server (in fenicsx-env)..."
conda run --no-capture-output -n fenicsx-env uvicorn server.main:app --host 0.0.0.0 --port 8000 --loop asyncio