const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUSDC", function () {
  let usdc, owner, lender, alice;

  const INITIAL_SUPPLY = 10_000_000n * 10n ** 6n;
  const LENDER_SEED    =  1_000_000n * 10n ** 6n;

  beforeEach(async function () {
    [owner, lender, alice] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy(lender.address);
    await usdc.waitForDeployment();
  });

  describe("Deployment", function () {
    it("has correct name and symbol", async function () {
      expect(await usdc.name()).to.equal("Mock USDC");
      expect(await usdc.symbol()).to.equal("mUSDC");
    });

    it("has 6 decimals", async function () {
      expect(await usdc.decimals()).to.equal(6);
    });

    it("mints LENDER_SEED to the default lender", async function () {
      expect(await usdc.balanceOf(lender.address)).to.equal(LENDER_SEED);
    });

    it("mints remaining supply to deployer (treasury)", async function () {
      expect(await usdc.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - LENDER_SEED);
    });

    it("has correct total supply", async function () {
      expect(await usdc.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Minting", function () {
    it("owner can mint additional tokens", async function () {
      const amount = 500_000n * 10n ** 6n;
      await usdc.connect(owner).mint(alice.address, amount);
      expect(await usdc.balanceOf(alice.address)).to.equal(amount);
    });

    it("non-owner cannot mint", async function () {
      await expect(
        usdc.connect(alice).mint(alice.address, 1000n)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Transfers", function () {
    it("lender can transfer tokens", async function () {
      const amount = 100n * 10n ** 6n;
      await usdc.connect(lender).transfer(alice.address, amount);
      expect(await usdc.balanceOf(alice.address)).to.equal(amount);
    });

    it("transfer emits Transfer event", async function () {
      const amount = 50n * 10n ** 6n;
      await expect(usdc.connect(lender).transfer(alice.address, amount))
        .to.emit(usdc, "Transfer")
        .withArgs(lender.address, alice.address, amount);
    });

    it("cannot transfer more than balance", async function () {
      await expect(
        usdc.connect(lender).transfer(alice.address, LENDER_SEED + 1n)
      ).to.be.reverted;
    });

    it("approve and transferFrom work correctly", async function () {
      const amount = 200n * 10n ** 6n;
      await usdc.connect(lender).approve(alice.address, amount);
      expect(await usdc.allowance(lender.address, alice.address)).to.equal(amount);
      await usdc.connect(alice).transferFrom(lender.address, alice.address, amount);
      expect(await usdc.balanceOf(alice.address)).to.equal(amount);
    });

    it("transferFrom fails without approval", async function () {
      await expect(
        usdc.connect(alice).transferFrom(lender.address, alice.address, 1n)
      ).to.be.reverted;
    });
  });
});
