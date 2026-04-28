#!/usr/bin/env bash
# dev-all.sh
# Orchestrates the full local dev stack in the correct order:
#   1. Hardhat node (background)
#   2. Deploy contracts + write .env files
#   3. PostgreSQL check
#   4. FastAPI backend (background)
#   5. Next.js frontend (foreground — keeps terminal alive)
#
# Usage:  npm run dev:all   (from nakshatra-lending/)
#         bash scripts/dev-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BLOCKCHAIN_DIR="$ROOT_DIR/blockchain"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

# Log files for background processes
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"
HARDHAT_LOG="$LOG_DIR/hardhat.log"
BACKEND_LOG="$LOG_DIR/backend.log"

# PIDs to clean up on exit
PIDS=()

cleanup() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo "  Done."
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

wait_for_port() {
  local name="$1" port="$2" retries="${3:-30}"
  echo -n "  Waiting for $name on port $port"
  for i in $(seq 1 "$retries"); do
    if curl -sf "http://127.0.0.1:${port}" > /dev/null 2>&1 || \
       nc -z 127.0.0.1 "$port" 2>/dev/null; then
      echo " ✓"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " TIMEOUT"
  return 1
}

wait_for_rpc() {
  local retries="${1:-30}"
  echo -n "  Waiting for Hardhat RPC"
  for i in $(seq 1 "$retries"); do
    if curl -sf -X POST http://127.0.0.1:8545 \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        > /dev/null 2>&1; then
      echo " ✓"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " TIMEOUT"
  return 1
}

set_env() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

parse_addr() {
  local output="$1" label="$2"
  echo "$output" | grep "${label}" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Hardhat node
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [1/5] Starting Hardhat node"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BLOCKCHAIN_DIR"
if [ ! -d "node_modules" ]; then
  echo "→ Installing blockchain dependencies..."
  npm install --silent
fi

npx hardhat node > "$HARDHAT_LOG" 2>&1 &
HARDHAT_PID=$!
PIDS+=("$HARDHAT_PID")
echo "  PID $HARDHAT_PID  (logs: .logs/hardhat.log)"

wait_for_rpc 30

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Deploy contracts
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [2/5] Deploying contracts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BLOCKCHAIN_DIR"
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT" | grep -E "(→|MockUSDC|UserProfileNFT|LoanFactory|Reputation|Escrow|LENDER|BORROWER|GUARANTOR)" || true

USDC_ADDR=$(parse_addr "$DEPLOY_OUTPUT" "MockUSDC:")
NFT_ADDR=$(parse_addr "$DEPLOY_OUTPUT" "UserProfileNFT:")
FACTORY_ADDR=$(parse_addr "$DEPLOY_OUTPUT" "LoanFactory:")
REPUTATION_ADDR=$(parse_addr "$DEPLOY_OUTPUT" "Reputation:")
ESCROW_ADDR=$(parse_addr "$DEPLOY_OUTPUT" "Escrow:")

if [ -z "$USDC_ADDR" ]; then
  echo "ERROR: Deploy failed — could not parse contract addresses."
  echo "Full output:"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo ""
echo "  MockUSDC:       $USDC_ADDR"
echo "  UserProfileNFT: $NFT_ADDR"
echo "  LoanFactory:    $FACTORY_ADDR"
echo "  Reputation:     $REPUTATION_ADDR"
echo "  Escrow:         $ESCROW_ADDR"

# Write to backend/.env
BACKEND_ENV="$BACKEND_DIR/.env"
set_env "$BACKEND_ENV" "USDC_ADDRESS"             "$USDC_ADDR"
set_env "$BACKEND_ENV" "USER_PROFILE_NFT_ADDRESS" "$NFT_ADDR"
set_env "$BACKEND_ENV" "LOAN_FACTORY_ADDRESS"     "$FACTORY_ADDR"
set_env "$BACKEND_ENV" "REPUTATION_ADDRESS"       "$REPUTATION_ADDR"
set_env "$BACKEND_ENV" "ESCROW_ADDRESS"           "$ESCROW_ADDR"
echo "  → backend/.env updated ✓"

# Write to frontend/.env.local
FRONTEND_ENV="$FRONTEND_DIR/.env.local"
touch "$FRONTEND_ENV"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_USDC_ADDRESS"          "$USDC_ADDR"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_LOAN_FACTORY_ADDRESS"  "$FACTORY_ADDR"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_ESCROW_ADDRESS"        "$ESCROW_ADDR"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URL"           "http://localhost:8000"
echo "  → frontend/.env.local updated ✓"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [3/5] PostgreSQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DB_URL=$(grep "^DATABASE_URL=" "$BACKEND_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '[:space:]')
DB_URL="${DB_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/nakshatra}"
DB_NAME=$(echo "$DB_URL" | grep -oE '[^/]+$')

# Check if postgres is running
if ! pg_isready -q 2>/dev/null; then
  echo "  PostgreSQL is not running. Attempting to start..."
  # Try common start commands
  if command -v pg_ctlcluster &>/dev/null; then
    pg_ctlcluster "$(pg_lsclusters -h | awk '{print $1}' | head -1)" main start 2>/dev/null || true
  elif command -v brew &>/dev/null; then
    brew services start postgresql@14 2>/dev/null || \
    brew services start postgresql 2>/dev/null || true
  fi
  sleep 2
fi

if pg_isready -q 2>/dev/null; then
  echo "  PostgreSQL is running ✓"
  createdb "$DB_NAME" 2>/dev/null && echo "  Created database '$DB_NAME' ✓" \
    || echo "  Database '$DB_NAME' already exists ✓"
else
  echo "  WARNING: PostgreSQL not reachable. Backend will fail to start."
  echo "  Start PostgreSQL manually, then re-run this script."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — FastAPI backend
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [4/5] Starting FastAPI backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BACKEND_DIR"

if [ ! -d "$VENV_DIR" ]; then
  echo "→ Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "→ Installing Python dependencies (this may take a moment)..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

(
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level warning \
    > "$BACKEND_LOG" 2>&1
) &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")
echo "  PID $BACKEND_PID  (logs: .logs/backend.log)"

wait_for_port "FastAPI" 8000 30
echo "  API docs: http://localhost:8000/docs"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Next.js frontend (foreground)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [5/5] Starting Next.js frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "→ Installing frontend dependencies..."
  npm install --silent
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All services started"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  API docs:   http://localhost:8000/docs"
echo "  Hardhat:    http://127.0.0.1:8545  (Chain ID: 31337)"
echo ""
echo "  Logs:  .logs/hardhat.log  |  .logs/backend.log"
echo "  Press Ctrl+C to stop all services."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run Next.js in foreground — keeps the script alive
exec npm run dev
