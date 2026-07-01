#!/bin/bash
set -euo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "=========================================="
echo "Build Environment Info"
echo "=========================================="
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "PWD: $(pwd)"
echo "COZE_WORKSPACE_PATH: ${COZE_WORKSPACE_PATH}"
echo "COZE_SUPABASE_URL set: $([ -n "${COZE_SUPABASE_URL:-}" ] && echo 'YES' || echo 'NO')"
echo "COZE_SUPABASE_ANON_KEY set: $([ -n "${COZE_SUPABASE_ANON_KEY:-}" ] && echo 'YES' || echo 'NO')"
echo "COZE_SUPABASE_SERVICE_ROLE_KEY set: $([ -n "${COZE_SUPABASE_SERVICE_ROLE_KEY:-}" ] && echo 'YES' || echo 'NO')"
echo "=========================================="

echo "Installing dependencies..."
#pnpm install --no-frozen-lockfile 2>&1

echo "Compiling custom server (src/server.ts -> dist/server.js)..."
pnpm tsup src/server.ts --format cjs --out-dir dist --clean 2>&1

echo "Building the Next.js project..."
pnpm next build 2>&1

BUILD_EXIT_CODE=$?
echo "=========================================="
echo "Build exit code: ${BUILD_EXIT_CODE}"
echo "=========================================="
exit ${BUILD_EXIT_CODE}
