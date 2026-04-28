#!/usr/bin/env bash
# start-backend.sh
# Sets up the Python venv, creates the PostgreSQL database, runs Alembic
# migrations, then starts the FastAPI server with uvicorn.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nakshatra — Starting FastAPI Backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BACKEND_DIR"

# ── Python venv ───────────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo "→ Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# Activate venv
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "→ Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# ── PostgreSQL ────────────────────────────────────────────────────────────
# Read DATABASE_URL from .env
DB_URL=$(grep "^DATABASE_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '[:space:]')
DB_URL="${DB_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/nakshatra}"

# Extract plain psql-compatible URL (swap asyncpg driver for psycopg2)
PSQL_URL="${DB_URL/+asyncpg/}"
PSQL_URL="${PSQL_URL/asyncpg/postgresql}"

# Extract DB name for createdb
DB_NAME=$(echo "$DB_URL" | grep -oE '[^/]+$')

echo "→ Ensuring PostgreSQL database '$DB_NAME' exists..."
# Try to create the database; ignore error if it already exists
createdb "$DB_NAME" 2>/dev/null && echo "  Created database '$DB_NAME'." \
  || echo "  Database '$DB_NAME' already exists."

# ── Wait for Hardhat node ─────────────────────────────────────────────────
echo "→ Checking Hardhat node..."
for i in $(seq 1 15); do
  if curl -sf -X POST http://127.0.0.1:8545 \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      > /dev/null 2>&1; then
    echo "  Hardhat node is reachable."
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "WARNING: Hardhat node not reachable. Backend will start but blockchain calls will fail."
    echo "         Run scripts/start-blockchain.sh and scripts/deploy-contracts.sh first."
  fi
  sleep 1
done

# ── Start FastAPI ─────────────────────────────────────────────────────────
echo ""
echo "→ Starting uvicorn on http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --log-level info
