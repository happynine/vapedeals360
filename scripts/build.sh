#!/bin/bash
set -euo pipefail

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

echo "Installing dependencies..."
npm install --no-package-lock 2>&1

echo "Building the Next.js project..."
npm run build 2>&1

echo "Build completed."