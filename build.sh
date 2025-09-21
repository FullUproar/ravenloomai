#!/bin/bash
echo "Current directory: $(pwd)"
echo "Contents of current directory:"
ls -la
echo "---"

if [ -d "frontend" ]; then
  echo "Frontend directory found!"
  cd frontend
  echo "Installing frontend dependencies..."
  npm install
  echo "Building frontend..."
  npm run build
  echo "Build complete!"
else
  echo "ERROR: Frontend directory not found!"
  echo "Looking for frontend in parent directory..."
  if [ -d "../frontend" ]; then
    echo "Found frontend in parent!"
    cd ../frontend
    npm install
    npm run build
  else
    echo "Frontend directory not found anywhere!"
    exit 1
  fi
fi