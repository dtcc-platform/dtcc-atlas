#!/bin/bash

# Start FastAPI server in development mode with auto-reload
uvicorn server.main:app --reload --host 0.0.0.0 --port 8000