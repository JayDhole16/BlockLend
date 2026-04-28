const { expect } = require("chai");
const { ethers } = require("hardhat");

// Role enum: 0=NONE, 1=BORROWER, 2=LENDER, 3=GUARANTOR
const Role = { NONE: 0, BORROWER: 1, LENDER: 2, GUARANTOR: 3 };

describe("UserProfileNFT", function () {
  let nft, owner, alice, bob, carol;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const UserProfileNFT = await ethers.getContractFactory("UserProfileNFT");
    nft = await UserProfileNFT.deploy();
    await nft.waitForDeployment();
  });

  describe("Deployment", function () {
    it("has correct name and symbol", async function () {
      expect(await nft.name()).to.equal("Nakshatra User Profile");
      expect(await nft.symbol()).to.equal("NUP");
    });
  });

  describe("Registration", function () {
    it("mints a token on first registration", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      expect(await nft.balanceOf(alice.address)).to.equal(1);
    });

    it("assigns tokenId 1 to first registrant", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      expect(await nft.walletToToken(alice.address)).to.equal(1);
    });

    it("sets default reputation score to 50", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      const profile = await nft.getProfile(alice.address);
      expect(profile.reputationScore).to.equal(50);
    });

    it("sets aiCreditScore and fraudRisk to 0 by default", async function () {
      await nft.connect(alice).register(Role.LENDER);
      const profile = await nft.getProfile(alice.address);
      expect(profile.aiCreditScore).to.equal(0);
      expect(profile.fraudRisk).to.equal(0);
    });

    it("stores the correct initial role", async function () {
      await nft.connect(alice).register(Role.GUARANTOR);
      const roles = await nft.getRoles(alice.address);
      expect(roles.length).to.equal(1);
      expect(roles[0]).to.equal(Role.GUARANTOR);
    });

    it("emits UserRegistered and RoleAdded events", async function () {
      await expect(nft.connect(alice).register(Role.BORROWER))
        .to.emit(nft, "UserRegistered").withArgs(alice.address, 1)
        .and.to.emit(nft, "RoleAdded").withArgs(alice.address, Role.BORROWER);
    });

    it("increments tokenId for each new user", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      await nft.connect(bob).register(Role.LENDER);
      expect(await nft.walletToToken(alice.address)).to.equal(1);
      expect(await nft.walletToToken(bob.address)).to.equal(2);
    });

    it("reverts on double registration", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      await expect(
        nft.connect(alice).register(Role.LENDER)
      ).to.be.revertedWithCustomError(nft, "AlreadyRegistered")
        .withArgs(alice.address);
    });
  });

  describe("Soulbound enforcement", function () {
    it("blocks transfer between users", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      const tokenId = await nft.walletToToken(alice.address);
      await expect(
        nft.connect(alice).transferFrom(alice.address, bob.address, tokenId)
      ).to.be.revertedWithCustomError(nft, "SoulboundToken");
    });

    it("blocks safeTransferFrom", async function () {
      await nft.connect(alice).register(Role.BORROWER);
      const tokenId = await nft.walletToToken(alice.address);
      await expect(
        nft.connect(alice)["safeTransferFrom(address,address,uint256)"](
          alice.address, bob.address, tokenId
        )
      ).to.be.revertedWithCustomError(nft, "SoulboundToken");
    });
  });

  describe("Role management", function () {
    beforeEach(async function () {
      await nft.connect(alice).register(Role.BORROWER);
    });

    it("owner can add a role", async function () {
      await nft.connect(owner).addRole(alice.address, Role.GUARANTOR);
      const roles = await nft.getRoles(alice.address);
      expect(roles.length).to.equal(2);
      expect(roles[1]).to.equal(Role.GUARANTOR);
    });

    it("addRole emits RoleAdded", async function () {
      await expect(nft.connect(owner).addRole(alice.address, Role.LENDER))
        .to.emit(nft, "RoleAdded").withArgs(alice.address, Role.LENDER);
    });

    it("non-owner cannot add a role", async function () {
      await expect(
        nft.connect(bob).addRole(alice.address, Role.LENDER)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("addRole reverts for unregistered wallet", async function () {
      await expect(
        nft.connect(owner).addRole(carol.address, Role.LENDER)
      ).to.be.revertedWithCustomError(nft, "NotRegistered").withArgs(carol.address);
    });
  });

  describe("AI score updates", function () {
    beforeEach(async function () {
      await nft.connect(alice).register(Role.BORROWER);
    });

    it("owner can update AI scores", async function () {
      await nft.connect(owner).updateAIScores(alice.address, 75, 10);
      const profile = await nft.getProfile(alice.address);
      expect(profile.aiCreditScore).to.equal(75);
      expect(profile.fraudRisk).to.equal(10);
    });

    it("updateAIScores emits ProfileUpdated", async function () {
      await expect(nft.connect(owner).updateAIScores(alice.address, 80, 5))
        .to.emit(nft, "ProfileUpdated").withArgs(alice.address, 1);
    });

    it("non-owner cannot update AI scores", async function () {
      await expect(
        nft.connect(bob).updateAIScores(alice.address, 80, 5)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Reputation updates", function () {
    beforeEach(async function () {
      await nft.connect(alice).register(Role.BORROWER);
    });

    it("owner can update reputation score", async function () {
      await nft.connect(owner).updateReputation(alice.address, 75);
      const profile = await nft.getProfile(alice.address);
      expect(profile.reputationScore).to.equal(75);
    });

    it("reverts for unregistered wallet", async function () {
      await expect(
        nft.connect(owner).updateReputation(carol.address, 60)
      ).to.be.revertedWithCustomError(nft, "NotRegistered");
    });
  });

  describe("getProfile / getRoles edge cases", function () {
    it("getProfile reverts for unregistered wallet", async function () {
      await expect(
        nft.getProfile(carol.address)
      ).to.be.revertedWithCustomError(nft, "NotRegistered").withArgs(carol.address);
    });

    it("getRoles reverts for unregistered wallet", async function () {
      await expect(
        nft.getRoles(carol.address)
      ).to.be.revertedWithCustomError(nft, "NotRegistered");
    });
  });
});
