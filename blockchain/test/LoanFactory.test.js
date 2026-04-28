const { expect } = require("chai");
const { ethers } = require("hardhat");

// LoanStatus enum indices
const Status = {
  GUARANTOR_PENDING: 0,
  OPEN_FOR_LENDERS:  1,
  READY_TO_FUND:     2,
  ACTIVE:            3,
  REPAID:            4,
  DEFAULTED:         5,
};

describe("LoanFactory", function () {
  let factory, owner, borrower, guarantor1, guarantor2, lender, stranger;

  const AMOUNT   = ethers.parseUnits("1000", 6); // 1000 USDC
  const DURATION = 30 * 24 * 60 * 60;            // 30 days in seconds
  const RATE     = 500;                           // 5% in bps
  const IPFS     = "QmTestHash";

  beforeEach(async function () {
    [owner, borrower, guarantor1, guarantor2, lender, stranger] = await ethers.getSigners();
    const LoanFactory = await ethers.getContractFactory("LoanFactory");
    factory = await LoanFactory.deploy();
    await factory.waitForDeployment();
  });

  // ── setEscrow ──────────────────────────────────────────────────────────────

  describe("setEscrow", function () {
    it("owner can set escrow address", async function () {
      await factory.connect(owner).setEscrow(lender.address);
      expect(await factory.escrow()).to.equal(lender.address);
    });

    it("non-owner cannot set escrow", async function () {
      await expect(
        factory.connect(stranger).setEscrow(stranger.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ── createLoanRequest ──────────────────────────────────────────────────────

  describe("createLoanRequest", function () {
    it("creates a loan with guarantors in GUARANTOR_PENDING status", async function () {
      await factory.connect(borrower).createLoanRequest(
        AMOUNT, DURATION, RATE, [guarantor1.address, guarantor2.address], IPFS
      );
      const loan = await factory.getLoan(1);
      expect(loan.status).to.equal(Status.GUARANTOR_PENDING);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.amount).to.equal(AMOUNT);
    });

    it("creates a loan with no guarantors directly in OPEN_FOR_LENDERS", async function () {
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
      const loan = await factory.getLoan(1);
      expect(loan.status).to.equal(Status.OPEN_FOR_LENDERS);
    });

    it("emits LoanCreated event", async function () {
      await expect(
        factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS)
      ).to.emit(factory, "LoanCreated")
        .withArgs(1, borrower.address, AMOUNT, DURATION, RATE, [], IPFS);
    });

    it("emits LoanOpenedForFunding when no guarantors", async function () {
      await expect(
        factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS)
      ).to.emit(factory, "LoanOpenedForFunding").withArgs(1);
    });

    it("tracks borrower loans", async function () {
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
      const ids = await factory.getBorrowerLoans(borrower.address);
      expect(ids.length).to.equal(2);
    });

    it("increments totalLoans", async function () {
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
      expect(await factory.totalLoans()).to.equal(1);
    });

    it("reverts on zero amount", async function () {
      await expect(
        factory.connect(borrower).createLoanRequest(0, DURATION, RATE, [], IPFS)
      ).to.be.revertedWithCustomError(factory, "ZeroAmount");
    });

    it("reverts on zero duration", async function () {
      await expect(
        factory.connect(borrower).createLoanRequest(AMOUNT, 0, RATE, [], IPFS)
      ).to.be.revertedWithCustomError(factory, "ZeroDuration");
    });
  });

  // ── approveGuarantor ───────────────────────────────────────────────────────

  describe("approveGuarantor", function () {
    beforeEach(async function () {
      await factory.connect(borrower).createLoanRequest(
        AMOUNT, DURATION, RATE, [guarantor1.address, guarantor2.address], IPFS
      );
    });

    it("listed guarantor can approve", async function () {
      await factory.connect(guarantor1).approveGuarantor(1);
      expect(await factory.guarantorApproved(1, guarantor1.address)).to.be.true;
    });

    it("emits GuarantorApproved event", async function () {
      await expect(factory.connect(guarantor1).approveGuarantor(1))
        .to.emit(factory, "GuarantorApproved")
        .withArgs(1, guarantor1.address, 1, 2);
    });

    it("status stays GUARANTOR_PENDING until all approve", async function () {
      await factory.connect(guarantor1).approveGuarantor(1);
      const loan = await factory.getLoan(1);
      expect(loan.status).to.equal(Status.GUARANTOR_PENDING);
    });

    it("moves to OPEN_FOR_LENDERS when all guarantors approve", async function () {
      await factory.connect(guarantor1).approveGuarantor(1);
      await factory.connect(guarantor2).approveGuarantor(1);
      const loan = await factory.getLoan(1);
      expect(loan.status).to.equal(Status.OPEN_FOR_LENDERS);
    });

    it("emits LoanOpenedForFunding when all approve", async function () {
      await factory.connect(guarantor1).approveGuarantor(1);
      await expect(factory.connect(guarantor2).approveGuarantor(1))
        .to.emit(factory, "LoanOpenedForFunding").withArgs(1);
    });

    it("reverts if caller is not a listed guarantor", async function () {
      await expect(
        factory.connect(stranger).approveGuarantor(1)
      ).to.be.revertedWithCustomError(factory, "NotGuarantor").withArgs(1, stranger.address);
    });

    it("reverts on double approval", async function () {
      await factory.connect(guarantor1).approveGuarantor(1);
      await expect(
        factory.connect(guarantor1).approveGuarantor(1)
      ).to.be.revertedWithCustomError(factory, "AlreadyApproved")
        .withArgs(1, guarantor1.address);
    });

    it("reverts if loan is not in GUARANTOR_PENDING status", async function () {
      // Move to OPEN_FOR_LENDERS first
      await factory.connect(guarantor1).approveGuarantor(1);
      await factory.connect(guarantor2).approveGuarantor(1);
      // Now try to approve again — wrong status
      await expect(
        factory.connect(guarantor1).approveGuarantor(1)
      ).to.be.revertedWithCustomError(factory, "InvalidStatus");
    });
  });

  // ── openLoanForFunding ─────────────────────────────────────────────────────

  describe("openLoanForFunding", function () {
    beforeEach(async function () {
      await factory.connect(borrower).createLoanRequest(
        AMOUNT, DURATION, RATE, [guarantor1.address], IPFS
      );
    });

    it("borrower can manually open loan for funding", async function () {
      await factory.connect(borrower).openLoanForFunding(1);
      const loan = await factory.getLoan(1);
      expect(loan.status).to.equal(Status.OPEN_FOR_LENDERS);
    });

    it("emits LoanOpenedForFunding", async function () {
      await expect(factory.connect(borrower).openLoanForFunding(1))
        .to.emit(factory, "LoanOpenedForFunding").withArgs(1);
    });

    it("non-borrower cannot open loan for funding", async function () {
      await expect(
        factory.connect(stranger).openLoanForFunding(1)
      ).to.be.revertedWithCustomError(factory, "NotBorrower").withArgs(1, stranger.address);
    });

    it("reverts if loan is not in GUARANTOR_PENDING", async function () {
      await factory.connect(borrower).openLoanForFunding(1);
      await expect(
        factory.connect(borrower).openLoanForFunding(1)
      ).to.be.revertedWithCustomError(factory, "InvalidStatus");
    });
  });

  // ── updateDocuments ────────────────────────────────────────────────────────

  describe("updateDocuments", function () {
    beforeEach(async function () {
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
    });

    it("borrower can update IPFS hash", async function () {
      await factory.connect(borrower).updateDocuments(1, "QmNewHash");
      const loan = await factory.getLoan(1);
      expect(loan.ipfsHash).to.equal("QmNewHash");
    });

    it("emits DocumentsUpdated", async function () {
      await expect(factory.connect(borrower).updateDocuments(1, "QmNewHash"))
        .to.emit(factory, "DocumentsUpdated").withArgs(1, "QmNewHash");
    });

    it("non-borrower cannot update documents", async function () {
      await expect(
        factory.connect(stranger).updateDocuments(1, "QmHack")
      ).to.be.revertedWithCustomError(factory, "NotBorrower");
    });
  });

  // ── Escrow callbacks (onlyEscrow) ──────────────────────────────────────────

  describe("Escrow callbacks", function () {
    beforeEach(async function () {
      await factory.connect(owner).setEscrow(lender.address); // lender acts as mock escrow
      await factory.connect(borrower).createLoanRequest(AMOUNT, DURATION, RATE, [], IPFS);
    });

    it("markReadyToFund sets READY_TO_FUND", async function () {
      await factory.connect(lender).markReadyToFund(1);
      expect((await factory.getLoan(1)).status).to.equal(Status.READY_TO_FUND);
    });

    it("markActive sets ACTIVE", async function () {
      await factory.connect(lender).markReadyToFund(1);
      await factory.connect(lender).markActive(1);
      expect((await factory.getLoan(1)).status).to.equal(Status.ACTIVE);
    });

    it("markRepaid sets REPAID", async function () {
      await factory.connect(lender).markReadyToFund(1);
      await factory.connect(lender).markActive(1);
      await factory.connect(lender).markRepaid(1);
      expect((await factory.getLoan(1)).status).to.equal(Status.REPAID);
    });

    it("markDefaulted sets DEFAULTED", async function () {
      await factory.connect(lender).markReadyToFund(1);
      await factory.connect(lender).markActive(1);
      await factory.connect(lender).markDefaulted(1);
      expect((await factory.getLoan(1)).status).to.equal(Status.DEFAULTED);
    });

    it("non-escrow cannot call markReadyToFund", async function () {
      await expect(
        factory.connect(stranger).markReadyToFund(1)
      ).to.be.revertedWithCustomError(factory, "NotEscrow");
    });
  });
});
