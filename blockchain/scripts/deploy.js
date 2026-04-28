const { ethers } = require("hardhat");
const { seedWallets } = require("./seedWallets");

async function main() {
  const signers = await ethers.getSigners();
  const deployer      = signers[0]; // wallet[0] — deployer / treasury
  const lender        = signers[1]; // wallet[1] — demo lender  (1,000,000 USDC)
  const borrower      = signers[2]; // wallet[2] — demo borrower
  const guarantor1    = signers[3]; // wallet[3] — guarantor 1
  const guarantor2    = signers[4]; // wallet[4] — guarantor 2
  // wallets[5-9] are extra participants (5,000 USDC each)

  console.log("=".repeat(55));
  console.log("  Nakshatra Lending — Local Deployment");
  console.log("=".repeat(55));
  console.log(`Deployer:   ${deployer.address}`);

  // ── 1. MockUSDC ────────────────────────────────────────────────────────────
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  // Deploy with lender as the seed recipient (gets 1,000,000 USDC in constructor)
  const usdc = await MockUSDC.deploy(lender.address);
  await usdc.waitForDeployment();
  console.log(`\nMockUSDC       → ${await usdc.getAddress()}`);

  // ── 2. UserProfileNFT ──────────────────────────────────────────────────────
  const UserProfileNFT = await ethers.getContractFactory("UserProfileNFT");
  const profileNFT = await UserProfileNFT.deploy();
  await profileNFT.waitForDeployment();
  console.log(`UserProfileNFT → ${await profileNFT.getAddress()}`);

  // ── 3. LoanFactory ─────────────────────────────────────────────────────────
  const LoanFactory = await ethers.getContractFactory("LoanFactory");
  const loanFactory = await LoanFactory.deploy();
  await loanFactory.waitForDeployment();
  console.log(`LoanFactory    → ${await loanFactory.getAddress()}`);

  // ── 4. Reputation ──────────────────────────────────────────────────────────
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy(await profileNFT.getAddress());
  await reputation.waitForDeployment();
  console.log(`Reputation     → ${await reputation.getAddress()}`);

  // ── 5. Escrow ──────────────────────────────────────────────────────────────
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(
    await usdc.getAddress(),
    await loanFactory.getAddress()
  );
  await escrow.waitForDeployment();
  console.log(`Escrow         → ${await escrow.getAddress()}`);

  // ── Wire contracts together ────────────────────────────────────────────────
  console.log("\nWiring contracts...");
  await loanFactory.setEscrow(await escrow.getAddress());
  await escrow.setReputation(await reputation.getAddress());
  await reputation.setAuthorized(await escrow.getAddress(), true);
  // Reputation needs to call updateReputation on ProfileNFT → transfer ownership
  await profileNFT.transferOwnership(await reputation.getAddress());
  console.log("Done.");

  // ── Seed USDC to wallets ───────────────────────────────────────────────────
  console.log("\nSeeding USDC balances...");
  await seedWallets(usdc, deployer, signers);

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("  CONTRACT ADDRESSES");
  console.log("=".repeat(55));
  console.log(`MockUSDC:       ${await usdc.getAddress()}`);
  console.log(`UserProfileNFT: ${await profileNFT.getAddress()}`);
  console.log(`LoanFactory:    ${await loanFactory.getAddress()}`);
  console.log(`Reputation:     ${await reputation.getAddress()}`);
  console.log(`Escrow:         ${await escrow.getAddress()}`);

  console.log("\n" + "=".repeat(55));
  console.log("  WALLET ADDRESSES  (import private keys into MetaMask)");
  console.log("=".repeat(55));
  await printWallets(signers);
}

async function printWallets(signers) {
  const { HDNodeWallet, Mnemonic } = require("ethers");
  const mnemonic = Mnemonic.fromPhrase(
    "test test test test test test test test test test test junk"
  );

  const labels = [
    "DEPLOYER  (treasury)",
    "LENDER    (1,000,000 USDC)",
    "BORROWER  (5,000 USDC)",
    "GUARANTOR1 (5,000 USDC)",
    "GUARANTOR2 (5,000 USDC)",
    "EXTRA_1   (5,000 USDC)",
    "EXTRA_2   (5,000 USDC)",
    "EXTRA_3   (5,000 USDC)",
    "EXTRA_4   (5,000 USDC)",
    "EXTRA_5   (5,000 USDC)",
  ];

  for (let i = 0; i < signers.length; i++) {
    const wallet = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${i}`);
    console.log(`\n[${i}] ${labels[i]}`);
    console.log(`    Address:     ${signers[i].address}`);
    console.log(`    Private Key: ${wallet.privateKey}`);
  }

  console.log("\n" + "=".repeat(55));
  console.log("  METAMASK QUICK-IMPORT");
  console.log("=".repeat(55));
  console.log("Network:  Hardhat Local");
  console.log("RPC URL:  http://127.0.0.1:8545");
  console.log("Chain ID: 31337");
  console.log("Currency: ETH");
  console.log("\nKey wallets:");

  const lender     = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/1`);
  const borrower   = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/2`);
  const guarantor1 = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/3`);
  const guarantor2 = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/4`);

  console.log(`LENDER     ${signers[1].address}  pk: ${lender.privateKey}`);
  console.log(`BORROWER   ${signers[2].address}  pk: ${borrower.privateKey}`);
  console.log(`GUARANTOR1 ${signers[3].address}  pk: ${guarantor1.privateKey}`);
  console.log(`GUARANTOR2 ${signers[4].address}  pk: ${guarantor2.privateKey}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
