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

echo "Copying static files to server/static..."
rm -rf server/static
mkdir -p server/static
cp -r frontend/dist/* server/static/

echo "Starting FastAPI server..."
uvicorn server.main:app --host 0.0.0.0 --port 8000 --loop asyncio
