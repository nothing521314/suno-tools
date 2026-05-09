#!/bin/bash

# Start FastAPI backend
python3 -u server.py &

# Start Next.js frontend
cd webapp && npm run start &

# Keep the script running
wait
