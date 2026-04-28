#!/bin/sh
# Runs inside the deployer container.
# Deploys all contracts to the running Hardhat node, then writes
# the resulting addresses to $SHARED_DIR/addresses.env (bind-mounted
# to the repo root on the host) so the backend can read them via env_file.

set -e

SHARED_DIR="${SHARED_DIR:-/shared}"
OUTPUT_FILE="$SHARED_DIR/addresses.env"

echo "==> Waiting for Hardhat node at http://hardhat:8545..."
until nc -z hardhat 8545 2>/dev/null; do
  sleep 1
done
echo "==> Node is ready."

echo "==> Deploying contracts..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT"

# Parse the 0x addresses that follow each label in the deploy output
parse_addr() {
  echo "$DEPLOY_OUTPUT" | grep "$1" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1
}

USDC_ADDRESS=$(parse_addr "MockUSDC:")
NFT_ADDRESS=$(parse_addr "UserProfileNFT:")
FACTORY_ADDRESS=$(parse_addr "LoanFactory:")
REPUTATION_ADDRESS=$(parse_addr "Reputation:")
ESCROW_ADDRESS=$(parse_addr "Escrow:")

if [ -z "$USDC_ADDRESS" ]; then
  echo "ERROR: Could not parse contract addresses. Check deploy output above."
  exit 1
fi

cat > "$OUTPUT_FILE" <<EOF
USDC_ADDRESS=$USDC_ADDRESS
USER_PROFILE_NFT_ADDRESS=$NFT_ADDRESS
LOAN_FACTORY_ADDRESS=$FACTORY_ADDRESS
REPUTATION_ADDRESS=$REPUTATION_ADDRESS
ESCROW_ADDRESS=$ESCROW_ADDRESS
EOF

echo ""
echo "==> Addresses written to $OUTPUT_FILE"
cat "$OUTPUT_FILE"
echo ""
echo "==> Done. Restart the backend to pick up the new addresses:"
echo "    docker compose restart backend"
