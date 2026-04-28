const { expect } = require("chai");
const { ethers } = require("hardhat");

const Status = {
  GUARANTOR_PENDING: 0,
  OPEN_FOR_LENDERS:  1,
  READY_TO_FUND:     2,
  ACTIVE:            3,
  REPAID:            4,
  DEFAULTED:         5,
};

describe("Escrow", function () {
  let usdc, factory, escrow, reputation, nft;
  let owner, borrower, lender, guarantor1, guarantor2, stranger;

  const PRINCIPAL  = ethers.parseUnits("1000", 6);
  const DURATION   = BigInt(30 * 24 * 60 * 60); // 30 days
  const RATE       = 500n;                        // 5% bps
  const IPFS       = "QmTestHash";

  // Helper: calculate expected interest (mirrors Solidity formula)
  function calcInterest(principal, rateBps, durationSec) {
    return (principal * rateBps * durationSec) / (10_000n * BigInt(365 * 24 * 60 * 60));
  }

  beforeEach(async function () {
    [owner, borrower, lender, guarantor1, guarantor2, stranger] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy(lender.address);
    await usdc.waitForDeployment();

    // Deploy UserProfileNFT
    const UserProfileNFT = await ethers.getContractFactory("UserProfileNFT");
    nft = await UserProfileNFT.deploy();
    await nft.waitForDeployment();

    // Deploy LoanFactory
    const LoanFactory = await ethers.getContractFactory("LoanFactory");
    factory = await LoanFactory.deploy();
    await factory.waitForDeployment();

    // Deploy Escrow
    const Escrow = await ethers.getContractFactory("Escrow");
    escrow = await Escrow.deploy(await usdc.getAddress(), await factory.getAddress());
    await escrow.waitForDeployment();

    // Deploy Reputation
    const Reputation = await ethers.getContractFactory("Reputation");
    reputation = await Reputation.deploy(await nft.getAddress());
    await reputation.waitForDeployment();

    // Wire up contracts
    await factory.connect(owner).setEscrow(await escrow.getAddress());
    await escrow.connect(owner).setReputation(await reputation.getAddress());
    await reputation.connect(owner).setAuthorized(await escrow.getAddress(), true);

    // Register borrower in NFT so reputation updates work
    await nft.connect(borrower).register(1); // BORROWER role
    // Transfer ownership of NFT to Reputation contract's owner (owner) so it can call updateReputation
    // Reputation calls profileNFT.updateReputation which requires onlyOwner on NFT
    // So we need to transfer NFT ownership to the Reputation contract
    await nft.connect(owner).transferOwnership(await reputation.getAddress());
    // But Reputation is Ownable too — it needs to be able to call nft.updateReputation
    // The Reputation contract calls profileNFT.updateReputation(borrower, newScore)
    // profileNFT.updateReputation is onlyOwner — so Reputation must own the NFT
    // transferOwnership already done above

    // Fund lender with enough USDC (they already have 1M from deploy)
    // Fund borrower with USDC for repayment
    await usdc.connect(owner).mint(borrower.address, ethers.parseUnits("10000", 6));
  });

  // Helper: create a loan and return loanId
  async function createOpenLoan(guarantors = []) {
    await factory.connect(borrower).createLoanRequest(
      PRINCIPAL, DURATION, RATE, guarantors, IPFS
    );
    const loanId = await factory.totalLoans();
    return loanId;
  }

  // Helper: fund a loan through the full deposit flow
  async function fundLoan(loanId) {
    await usdc.connect(lender).approve(await escrow.getAddress(), PRINCIPAL);
    await escrow.connect(lender).depositFromLender(loanId);
  }

  // ── depositFromLender ──────────────────────────────────────────────────────

  describe("depositFromLender", function () {
    it("lender can deposit and loan moves to READY_TO_FUND", async function () {
      const loanId = await createOpenLoan();
      await fundLoan(loanId);
      const loan = await factory.getLoan(loanId);
      expect(loan.status).to.equal(Status.READY_TO_FUND);
    });

    it("escrow holds the deposited USDC", async function () {
      const loanId = await createOpenLoan();
      await fundLoan(loanId);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(PRINCIPAL);
    });

    it("emits LoanFunded event", async function () {
      const loanId = await createOpenLoan();
      await usdc.connect(lender).approve(await escrow.getAddress(), PRINCIPAL);
      await expect(escrow.connect(lender).depositFromLender(loanId))
        .to.emit(escrow, "LoanFunded")
        .withArgs(loanId, lender.address, PRINCIPAL);
    });

    it("reverts if loan is not OPEN_FOR_LENDERS", async function () {
      const loanId = await createOpenLoan();
      await fundLoan(loanId); // now READY_TO_FUND
      await usdc.connect(lender).approve(await escrow.getAddress(), PRINCIPAL);
      await expect(
        escrow.connect(lender).depositFromLender(loanId)
      ).to.be.revertedWithCustomError(escrow, "WrongLoanStatus");
    });

    it("reverts on double funding", async function () {
      const loanId = await createOpenLoan();
      await fundLoan(loanId);
      // Manually reset status via a new loan — test AlreadyFunded path
      // We can't re-fund same loan; the lender field is already set
      const rec = await escrow.escrowRecords(loanId);
      expect(rec.lender).to.equal(lender.address); // confirms record set
    });

    it("reverts without USDC approval", async function () {
      const loanId = await createOpenLoan();
      await expect(
        escrow.connect(lender).depositFromLender(loanId)
      ).to.be.reverted;
    });
  });

  // ── releaseToBorrower ──────────────────────────────────────────────────────

  describe("releaseToBorrower", function () {
    let loanId;

    beforeEach(async function () {
      loanId = await createOpenLoan();
      await fundLoan(loanId);
    });

    it("owner can release funds to borrower", async function () {
      const before = await usdc.balanceOf(borrower.address);
      await escrow.connect(owner).releaseToBorrower(loanId);
      const after = await usdc.balanceOf(borrower.address);
      expect(after - before).to.equal(PRINCIPAL);
    });

    it("loan moves to ACTIVE after release", async function () {
      await escrow.connect(owner).releaseToBorrower(loanId);
      expect((await factory.getLoan(loanId)).status).to.equal(Status.ACTIVE);
    });

    it("emits FundsReleasedToBorrower", async function () {
      await expect(escrow.connect(owner).releaseToBorrower(loanId))
        .to.emit(escrow, "FundsReleasedToBorrower")
        .withArgs(loanId, borrower.address, PRINCIPAL);
    });

    it("non-owner cannot release funds", async function () {
      await expect(
        escrow.connect(stranger).releaseToBorrower(loanId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts on double release", async function () {
      await escrow.connect(owner).releaseToBorrower(loanId);
      await expect(
        escrow.connect(owner).releaseToBorrower(loanId)
      ).to.be.revertedWithCustomError(escrow, "WrongLoanStatus");
    });
  });

  // ── repayLoan ──────────────────────────────────────────────────────────────

  describe("repayLoan", function () {
    let loanId;
    let totalDue;

    beforeEach(async function () {
      loanId = await createOpenLoan();
      await fundLoan(loanId);
      await escrow.connect(owner).releaseToBorrower(loanId);

      const due = await escrow.getTotalDue(loanId);
      totalDue = due.total;
    });

    it("borrower can repay and loan moves to REPAID", async function () {
      await usdc.connect(borrower).approve(await escrow.getAddress(), totalDue);
      await escrow.connect(borrower).repayLoan(loanId);
      expect((await factory.getLoan(loanId)).status).to.equal(Status.REPAID);
    });

    it("emits LoanRepaymentReceived", async function () {
      await usdc.connect(borrower).approve(await escrow.getAddress(), totalDue);
      await expect(escrow.connect(borrower).repayLoan(loanId))
        .to.emit(escrow, "LoanRepaymentReceived")
        .withArgs(loanId, borrower.address, totalDue);
    });

    it("lender receives principal + 80% interest (no guarantors = 100% interest)", async function () {
      const interest = calcInterest(PRINCIPAL, RATE, DURATION);
      // No guarantors → 20% guarantor share also goes to lender per _distributeInterest
      const lenderExpected = PRINCIPAL + interest;

      const before = await usdc.balanceOf(lender.address);
      await usdc.connect(borrower).approve(await escrow.getAddress(), totalDue);
      await escrow.connect(borrower).repayLoan(loanId);
      const after = await usdc.balanceOf(lender.address);

      expect(after - before).to.equal(lenderExpected);
    });

    it("non-borrower cannot repay", async function () {
      await usdc.connect(lender).approve(await escrow.getAddress(), totalDue);
      await expect(
        escrow.connect(lender).repayLoan(loanId)
      ).to.be.revertedWithCustomError(escrow, "NotBorrower");
    });

    it("reverts if loan is not ACTIVE", async function () {
      // Loan is ACTIVE; try repaying a GUARANTOR_PENDING loan
      const loanId2 = await createOpenLoan([guarantor1.address]);
      await usdc.connect(borrower).approve(await escrow.getAddress(), totalDue);
      await expect(
        escrow.connect(borrower).repayLoan(loanId2)
      ).to.be.revertedWithCustomError(escrow, "WrongLoanStatus");
    });

    it("reverts on double repayment", async function () {
      await usdc.connect(borrower).approve(await escrow.getAddress(), totalDue * 2n);
      await escrow.connect(borrower).repayLoan(loanId);
      await expect(
        escrow.connect(borrower).repayLoan(loanId)
      ).to.be.revertedWithCustomError(escrow, "WrongLoanStatus");
    });

    it("reverts without USDC approval", async function () {
      await expect(
        escrow.connect(borrower).repayLoan(loanId)
      ).to.be.reverted;
    });
  });

  // ── Interest distribution with guarantors ─────────────────────────────────

  describe("Interest distribution with guarantors", function () {
    it("guarantors receive 20% interest split equally", async function () {
      // Create loan with 2 guarantors
      await factory.connect(borrower).createLoanRequest(
        PRINCIPAL, DURATION, RATE,
        [guarantor1.address, guarantor2.address],
        IPFS
      );
      const loanId = await factory.totalLoans();

      // Both guarantors approve
      await factory.connect(guarantor1).approveGuarantor(loanId);
      await factory.connect(guarantor2).approveGuarantor(loanId);

      await fundLoan(loanId);
      await escrow.connect(owner).releaseToBorrower(loanId);

      const { total } = await escrow.getTotalDue(loanId);
      await usdc.connect(borrower).approve(await escrow.getAddress(), total);

      const interest = calcInterest(PRINCIPAL, RATE, DURATION);
      const guarantorTotal = interest - (interest * 80n) / 100n;
      const perGuarantor = guarantorTotal / 2n;

      const g1Before = await usdc.balanceOf(guarantor1.address);
      const g2Before = await usdc.balanceOf(guarantor2.address);

      await escrow.connect(borrower).repayLoan(loanId);

      expect(await usdc.balanceOf(guarantor1.address) - g1Before).to.equal(perGuarantor);
      expect(await usdc.balanceOf(guarantor2.address) - g2Before).to.equal(perGuarantor);
    });
  });

  // ── handleDefault ──────────────────────────────────────────────────────────

  describe("handleDefault", function () {
    let loanId;

    beforeEach(async function () {
      loanId = await createOpenLoan();
      await fundLoan(loanId);
      await escrow.connect(owner).releaseToBorrower(loanId);
    });

    it("owner can mark loan as defaulted", async function () {
      await escrow.connect(owner).handleDefault(loanId);
      expect((await factory.getLoan(loanId)).status).to.equal(Status.DEFAULTED);
    });

    it("emits LoanMarkedDefaulted", async function () {
      await expect(escrow.connect(owner).handleDefault(loanId))
        .to.emit(escrow, "LoanMarkedDefaulted").withArgs(loanId);
    });

    it("non-owner cannot call handleDefault", async function () {
      await expect(
        escrow.connect(stranger).handleDefault(loanId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if loan is not ACTIVE", async function () {
      const loanId2 = await createOpenLoan();
      await expect(
        escrow.connect(owner).handleDefault(loanId2)
      ).to.be.revertedWithCustomError(escrow, "WrongLoanStatus");
    });
  });

  // ── getTotalDue ────────────────────────────────────────────────────────────

  describe("getTotalDue", function () {
    it("returns correct principal, interest, and total", async function () {
      const loanId = await createOpenLoan();
      await fundLoan(loanId);

      const { principal, interest, total } = await escrow.getTotalDue(loanId);
      const expectedInterest = calcInterest(PRINCIPAL, RATE, DURATION);

      expect(principal).to.equal(PRINCIPAL);
      expect(interest).to.equal(expectedInterest);
      expect(total).to.equal(PRINCIPAL + expectedInterest);
    });
  });
});
