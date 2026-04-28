const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reputation", function () {
  let nft, reputation, owner, escrow, borrower, stranger;

  const REPAYMENT_BONUS = 5n;
  const DEFAULT_PENALTY = 20n;
  const DEFAULT_SCORE   = 50n;

  beforeEach(async function () {
    [owner, escrow, borrower, stranger] = await ethers.getSigners();

    // Deploy NFT
    const UserProfileNFT = await ethers.getContractFactory("UserProfileNFT");
    nft = await UserProfileNFT.deploy();
    await nft.waitForDeployment();

    // Deploy Reputation
    const Reputation = await ethers.getContractFactory("Reputation");
    reputation = await Reputation.deploy(await nft.getAddress());
    await reputation.waitForDeployment();

    // Transfer NFT ownership to Reputation so it can call updateReputation
    await nft.connect(owner).transferOwnership(await reputation.getAddress());

    // Register borrower
    await nft.connect(borrower).register(1); // BORROWER role

    // Authorize the mock escrow signer
    await reputation.connect(owner).setAuthorized(escrow.address, true);
  });

  // ── setAuthorized ──────────────────────────────────────────────────────────

  describe("setAuthorized", function () {
    it("owner can authorize a caller", async function () {
      expect(await reputation.authorized(escrow.address)).to.be.true;
    });

    it("owner can revoke authorization", async function () {
      await reputation.connect(owner).setAuthorized(escrow.address, false);
      expect(await reputation.authorized(escrow.address)).to.be.false;
    });

    it("emits AuthorizedCallerSet", async function () {
      await expect(reputation.connect(owner).setAuthorized(stranger.address, true))
        .to.emit(reputation, "AuthorizedCallerSet")
        .withArgs(stranger.address, true);
    });

    it("non-owner cannot set authorized", async function () {
      await expect(
        reputation.connect(stranger).setAuthorized(stranger.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ── recordRepayment ────────────────────────────────────────────────────────

  describe("recordRepayment", function () {
    it("increases reputation by REPAYMENT_BONUS", async function () {
      await reputation.connect(escrow).recordRepayment(borrower.address);
      expect(await reputation.getScore(borrower.address))
        .to.equal(DEFAULT_SCORE + REPAYMENT_BONUS);
    });

    it("emits ReputationIncreased", async function () {
      await expect(reputation.connect(escrow).recordRepayment(borrower.address))
        .to.emit(reputation, "ReputationIncreased")
        .withArgs(borrower.address, DEFAULT_SCORE, DEFAULT_SCORE + REPAYMENT_BONUS);
    });

    it("caps score at MAX_SCORE (100)", async function () {
      // Manually set score to 98 via multiple repayments
      // 50 → 55 → 60 → 65 → 70 → 75 → 80 → 85 → 90 → 95 → 100
      for (let i = 0; i < 10; i++) {
        await reputation.connect(escrow).recordRepayment(borrower.address);
      }
      expect(await reputation.getScore(borrower.address)).to.equal(100n);

      // One more repayment should stay at 100
      await reputation.connect(escrow).recordRepayment(borrower.address);
      expect(await reputation.getScore(borrower.address)).to.equal(100n);
    });

    it("owner can also call recordRepayment", async function () {
      await reputation.connect(owner).recordRepayment(borrower.address);
      expect(await reputation.getScore(borrower.address))
        .to.equal(DEFAULT_SCORE + REPAYMENT_BONUS);
    });

    it("unauthorized caller cannot call recordRepayment", async function () {
      await expect(
        reputation.connect(stranger).recordRepayment(borrower.address)
      ).to.be.revertedWithCustomError(reputation, "Unauthorized").withArgs(stranger.address);
    });

    it("reverts for unregistered borrower", async function () {
      await expect(
        reputation.connect(escrow).recordRepayment(stranger.address)
      ).to.be.revertedWithCustomError(nft, "NotRegistered");
    });
  });

  // ── recordDefault ──────────────────────────────────────────────────────────

  describe("recordDefault", function () {
    it("decreases reputation by DEFAULT_PENALTY", async function () {
      await reputation.connect(escrow).recordDefault(borrower.address);
      expect(await reputation.getScore(borrower.address))
        .to.equal(DEFAULT_SCORE - DEFAULT_PENALTY);
    });

    it("emits ReputationDecreased", async function () {
      await expect(reputation.connect(escrow).recordDefault(borrower.address))
        .to.emit(reputation, "ReputationDecreased")
        .withArgs(borrower.address, DEFAULT_SCORE, DEFAULT_SCORE - DEFAULT_PENALTY);
    });

    it("floors score at 0 (no underflow)", async function () {
      // Reduce score below DEFAULT_PENALTY threshold
      // 50 → 30 → 10 → 0 (floored)
      await reputation.connect(escrow).recordDefault(borrower.address); // 50→30
      await reputation.connect(escrow).recordDefault(borrower.address); // 30→10
      await reputation.connect(escrow).recordDefault(borrower.address); // 10→0 (floored)
      expect(await reputation.getScore(borrower.address)).to.equal(0n);

      // Another default should stay at 0
      await reputation.connect(escrow).recordDefault(borrower.address);
      expect(await reputation.getScore(borrower.address)).to.equal(0n);
    });

    it("unauthorized caller cannot call recordDefault", async function () {
      await expect(
        reputation.connect(stranger).recordDefault(borrower.address)
      ).to.be.revertedWithCustomError(reputation, "Unauthorized").withArgs(stranger.address);
    });

    it("reverts for unregistered borrower", async function () {
      await expect(
        reputation.connect(escrow).recordDefault(stranger.address)
      ).to.be.revertedWithCustomError(nft, "NotRegistered");
    });
  });

  // ── Mixed repayment + default scenarios ───────────────────────────────────

  describe("Mixed scenarios", function () {
    it("repayment after default recovers score", async function () {
      await reputation.connect(escrow).recordDefault(borrower.address);  // 50→30
      await reputation.connect(escrow).recordRepayment(borrower.address); // 30→35
      expect(await reputation.getScore(borrower.address)).to.equal(35n);
    });

    it("multiple repayments then default", async function () {
      await reputation.connect(escrow).recordRepayment(borrower.address); // 50→55
      await reputation.connect(escrow).recordRepayment(borrower.address); // 55→60
      await reputation.connect(escrow).recordDefault(borrower.address);   // 60→40
      expect(await reputation.getScore(borrower.address)).to.equal(40n);
    });
  });

  // ── getScore ───────────────────────────────────────────────────────────────

  describe("getScore", function () {
    it("returns default score of 50 for new registrant", async function () {
      expect(await reputation.getScore(borrower.address)).to.equal(DEFAULT_SCORE);
    });

    it("reverts for unregistered wallet", async function () {
      await expect(
        reputation.getScore(stranger.address)
      ).to.be.revertedWithCustomError(nft, "NotRegistered");
    });
  });

  // ── Constants ─────────────────────────────────────────────────────────────

  describe("Constants", function () {
    it("REPAYMENT_BONUS is 5", async function () {
      expect(await reputation.REPAYMENT_BONUS()).to.equal(5n);
    });

    it("DEFAULT_PENALTY is 20", async function () {
      expect(await reputation.DEFAULT_PENALTY()).to.equal(20n);
    });

    it("MAX_SCORE is 100", async function () {
      expect(await reputation.MAX_SCORE()).to.equal(100n);
    });
  });
});
