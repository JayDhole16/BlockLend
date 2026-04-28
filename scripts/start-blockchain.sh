#!/usr/bin/env bash
# start-blockchain.sh
# Starts the Hardhat local node in the foreground.
# Run this in its own terminal — it must stay alive for the other scripts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_DIR="$SCRIPT_DIR/../blockchain"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nakshatra — Starting Hardhat Node"
echo "  RPC: http://127.0.0.1:8545  Chain ID: 31337"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$BLOCKCHAIN_DIR"

# Install node_modules if missing
if [ ! -d "node_modules" ]; then
  echo "→ Installing blockchain dependencies..."
  npm install --silent
fi

exec npx hardhat node
