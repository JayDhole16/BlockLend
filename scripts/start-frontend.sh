#!/usr/bin/env bash
# start-frontend.sh
# Installs npm dependencies and starts the Next.js dev server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nakshatra — Starting Next.js Frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$FRONTEND_DIR"

# Install dependencies if node_modules is missing or package.json changed
if [ ! -d "node_modules" ]; then
  echo "→ Installing frontend dependencies..."
  npm install --silent
fi

# Verify contract addresses are set
ENV_FILE="$FRONTEND_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  USDC=$(grep "^NEXT_PUBLIC_USDC_ADDRESS=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '[:space:]')
  if [ -z "$USDC" ]; then
    echo "WARNING: NEXT_PUBLIC_USDC_ADDRESS not set in frontend/.env.local"
    echo "         Run scripts/deploy-contracts.sh first."
  fi
fi

echo "→ Starting Next.js on http://localhost:3000"
echo ""

exec npm run dev
