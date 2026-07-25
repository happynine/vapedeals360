#!/bin/bash
set -euo pipefail
echo "Building Next.js..."
npx next build 2>&1
echo "Build completed."
