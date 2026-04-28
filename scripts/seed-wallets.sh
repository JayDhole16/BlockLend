#!/usr/bin/env bash
# seed-wallets.sh
# Re-seeds USDC to all test wallets from the treasury (wallet[0]).
# Useful after a fresh deploy or if you need to top up balances.
# Requires USDC_ADDRESS to be set in backend/.env (done by deploy-contracts.sh).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BLOCKCHAIN_DIR="$ROOT_DIR/blockchain"
BACKEND_ENV="$ROOT_DIR/backend/.env"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nakshatra — Seeding Wallets with USDC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Read USDC_ADDRESS from backend/.env
if [ -f "$BACKEND_ENV" ]; then
  USDC_ADDRESS=$(grep "^USDC_ADDRESS=" "$BACKEND_ENV" | cut -d'=' -f2 | tr -d '[:space:]')
fi

if [ -z "${USDC_ADDRESS:-}" ]; then
  echo "ERROR: USDC_ADDRESS not set. Run deploy-contracts.sh first."
  exit 1
fi

echo "→ MockUSDC at: $USDC_ADDRESS"

cd "$BLOCKCHAIN_DIR"
USDC_ADDRESS="$USDC_ADDRESS" npx hardhat run scripts/seedWallets.js --network localhost

echo ""
echo "  Wallets seeded ✓"
