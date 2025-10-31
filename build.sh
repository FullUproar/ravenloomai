#!/bin/bash
set -e

echo "Current directory: $(pwd)"
echo "Contents of current directory:"
ls -la
echo "---"

if [ -d "frontend" ]; then
  echo "Frontend directory found!"
  cd frontend
  echo "Installing frontend dependencies..."
  npm install
  echo "Current directory after cd: $(pwd)"
  echo "Checking for vite binary..."
  ls -la node_modules/.bin/vite || echo "vite binary not found!"
  echo "Checking if vite is in node_modules..."
  ls -la node_modules/vite/ || echo "vite package not found in node_modules!"
  echo "Building frontend with direct vite path..."
  ./node_modules/.bin/vite build
  echo "Build complete!"
else
  echo "ERROR: Frontend directory not found!"
  echo "Looking for frontend in parent directory..."
  if [ -d "../frontend" ]; then
    echo "Found frontend in parent!"
    cd ../frontend
    npm install
    export PATH="$PWD/node_modules/.bin:$PATH"
    npm run build
  else
    echo "Frontend directory not found anywhere!"
    exit 1
  fi
fi