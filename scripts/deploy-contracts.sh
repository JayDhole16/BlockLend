#!/usr/bin/env bash
# deploy-contracts.sh
# Deploys all contracts to the running Hardhat node, then writes the
# resulting addresses into backend/.env and frontend/.env.local.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BLOCKCHAIN_DIR="$ROOT_DIR/blockchain"
BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env.local"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nakshatra — Deploying Contracts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BLOCKCHAIN_DIR"

# Wait for Hardhat node to be ready
echo "→ Waiting for Hardhat node at http://127.0.0.1:8545..."
for i in $(seq 1 30); do
  if curl -sf -X POST http://127.0.0.1:8545 \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      > /dev/null 2>&1; then
    echo "  Node is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Hardhat node did not start within 30 seconds."
    echo "       Run scripts/start-blockchain.sh in a separate terminal first."
    exit 1
  fi
  sleep 1
done

# Run deploy and capture output
echo "→ Running deploy.js..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT"

# ── Parse contract addresses from deploy output ───────────────────────────
parse_addr() {
  echo "$DEPLOY_OUTPUT" | grep "$1" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1
}

USDC_ADDR=$(parse_addr "MockUSDC:")
NFT_ADDR=$(parse_addr "UserProfileNFT:")
FACTORY_ADDR=$(parse_addr "LoanFactory:")
REPUTATION_ADDR=$(parse_addr "Reputation:")
ESCROW_ADDR=$(parse_addr "Escrow:")

if [ -z "$USDC_ADDR" ]; then
  echo "ERROR: Could not parse contract addresses from deploy output."
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Parsed Addresses"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  USDC:           $USDC_ADDR"
echo "  UserProfileNFT: $NFT_ADDR"
echo "  LoanFactory:    $FACTORY_ADDR"
echo "  Reputation:     $REPUTATION_ADDR"
echo "  Escrow:         $ESCROW_ADDR"

# ── Update backend/.env ───────────────────────────────────────────────────
echo ""
echo "→ Writing addresses to $BACKEND_ENV..."

# Helper: set or add a key=value in an env file
set_env() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Replace existing line (cross-platform sed)
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

set_env "$BACKEND_ENV" "USDC_ADDRESS"              "$USDC_ADDR"
set_env "$BACKEND_ENV" "USER_PROFILE_NFT_ADDRESS"  "$NFT_ADDR"
set_env "$BACKEND_ENV" "LOAN_FACTORY_ADDRESS"       "$FACTORY_ADDR"
set_env "$BACKEND_ENV" "REPUTATION_ADDRESS"         "$REPUTATION_ADDR"
set_env "$BACKEND_ENV" "ESCROW_ADDRESS"             "$ESCROW_ADDR"

echo "  backend/.env updated ✓"

# ── Update frontend/.env.local ────────────────────────────────────────────
echo "→ Writing addresses to $FRONTEND_ENV..."

# Ensure file exists
touch "$FRONTEND_ENV"

set_env "$FRONTEND_ENV" "NEXT_PUBLIC_USDC_ADDRESS"         "$USDC_ADDR"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_LOAN_FACTORY_ADDRESS"  "$FACTORY_ADDR"
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_ESCROW_ADDRESS"        "$ESCROW_ADDR"

# Ensure backend URL is set
set_env "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URL" "http://localhost:8000"

echo "  frontend/.env.local updated ✓"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment complete. Run start-backend.sh next."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
