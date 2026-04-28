const { ethers } = require("hardhat");

const USDC_DECIMALS   = 6;
const LENDER_AMOUNT   = 1_000_000n * 10n ** BigInt(USDC_DECIMALS); // wallet[1]
const DEFAULT_AMOUNT  =     5_000n * 10n ** BigInt(USDC_DECIMALS); // wallet[2-9]

/**
 * Distribute MockUSDC to all test wallets.
 * Called automatically by deploy.js, but can also be run standalone:
 *   npx hardhat run scripts/seedWallets.js --network localhost
 *
 * @param {ethers.Contract} usdc     - deployed MockUSDC instance (optional for standalone)
 * @param {ethers.Signer}   deployer - signer that owns the treasury supply
 * @param {ethers.Signer[]} signers  - all 10 test signers
 */
async function seedWallets(usdc, deployer, signers) {
  // wallet[1] already received 1,000,000 USDC in the MockUSDC constructor.
  // We only need to distribute 5,000 USDC to wallets[2-9] from the treasury.
  for (let i = 2; i < signers.length; i++) {
    const tx = await usdc.connect(deployer).transfer(signers[i].address, DEFAULT_AMOUNT);
    await tx.wait();
    console.log(`  wallet[${i}] ${signers[i].address} → 5,000 USDC`);
  }

  // Print final balances
  console.log("\n  Final USDC balances:");
  for (let i = 0; i < signers.length; i++) {
    const bal = await usdc.balanceOf(signers[i].address);
    const formatted = (Number(bal) / 10 ** USDC_DECIMALS).toLocaleString();
    console.log(`  [${i}] ${signers[i].address}  ${formatted} USDC`);
  }
}

// ── Standalone entry point ─────────────────────────────────────────────────
async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Resolve MockUSDC address from the network (must be deployed first)
  // Read from deployments or pass address as env var: USDC_ADDRESS=0x...
  const usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    console.error("Set USDC_ADDRESS env var to the deployed MockUSDC address.");
    console.error("Or run deploy.js which calls seedWallets automatically.");
    process.exit(1);
  }

  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  console.log("Seeding wallets from MockUSDC at:", usdcAddress);
  await seedWallets(usdc, deployer, signers);
}

// Only run main() when executed directly, not when require()'d
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { seedWallets };
