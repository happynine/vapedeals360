#!/bin/bash
set -euo pipefail

echo "Installing dependencies..."
npm install --no-package-lock 2>&1

echo "Building Next.js..."
pnpm next build 2>&1

echo "Build completed."