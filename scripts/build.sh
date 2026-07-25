#!/bin/bash
set -euo pipefail

echo "Installing dependencies..."
pnpm install --no-frozen-lockfile 2>&1

echo "Building Next.js..."
pnpm next build 2>&1

echo "Build completed."