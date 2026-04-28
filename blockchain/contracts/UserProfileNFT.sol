// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title UserProfileNFT
 * @notice Soulbound (non-transferable) NFT minted once per wallet on registration.
 *         Stores on-chain profile data: reputation, AI credit score, fraud risk, and roles.
 */
contract UserProfileNFT is ERC721, Ownable {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum Role { NONE, BORROWER, LENDER, GUARANTOR }

    struct UserProfile {
        address walletAddress;
        uint256 reputationScore; // default 50, range 0-100
        uint256 aiCreditScore;   // set by AI oracle, range 0-100
        uint256 fraudRisk;       // set by AI oracle, range 0-100
        Role[]  roles;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// tokenId → profile
    mapping(uint256 => UserProfile) public profiles;
    /// wallet  → tokenId (0 = not registered)
    mapping(address => uint256) public walletToToken;

    // ─── Events ───────────────────────────────────────────────────────────────

    event UserRegistered(address indexed wallet, uint256 indexed tokenId);
    event ProfileUpdated(address indexed wallet, uint256 indexed tokenId);
    event RoleAdded(address indexed wallet, Role role);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error AlreadyRegistered(address wallet);
    error NotRegistered(address wallet);
    error SoulboundToken();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC721("Nakshatra User Profile", "NUP") {}

    // ─── External ─────────────────────────────────────────────────────────────

    /**
     * @notice Register a new user. Mints a soulbound NFT to the caller.
     * @param role Initial role for the user.
     */
    function register(Role role) external {
        if (walletToToken[msg.sender] != 0) revert AlreadyRegistered(msg.sender);

        _nextTokenId++;
        uint256 tokenId = _nextTokenId;

        _safeMint(msg.sender, tokenId);
        walletToToken[msg.sender] = tokenId;

        Role[] memory roles = new Role[](1);
        roles[0] = role;

        profiles[tokenId] = UserProfile({
            walletAddress:  msg.sender,
            reputationScore: 50,
            aiCreditScore:   0,
            fraudRisk:       0,
            roles:           roles
        });

        emit UserRegistered(msg.sender, tokenId);
        emit RoleAdded(msg.sender, role);
    }

    /**
     * @notice Add an additional role to an existing profile.
     */
    function addRole(address wallet, Role role) external onlyOwner {
        uint256 tokenId = _requireRegistered(wallet);
        profiles[tokenId].roles.push(role);
        emit RoleAdded(wallet, role);
    }

    /**
     * @notice Update AI-generated scores. Called by the backend AI oracle.
     */
    function updateAIScores(
        address wallet,
        uint256 aiCreditScore,
        uint256 fraudRisk
    ) external onlyOwner {
        uint256 tokenId = _requireRegistered(wallet);
        profiles[tokenId].aiCreditScore = aiCreditScore;
        profiles[tokenId].fraudRisk     = fraudRisk;
        emit ProfileUpdated(wallet, tokenId);
    }

    /**
     * @notice Update reputation score. Called by Reputation contract.
     */
    function updateReputation(address wallet, uint256 newScore) external onlyOwner {
        uint256 tokenId = _requireRegistered(wallet);
        profiles[tokenId].reputationScore = newScore;
        emit ProfileUpdated(wallet, tokenId);
    }

    /// @notice Returns the full profile for a wallet.
    function getProfile(address wallet) external view returns (UserProfile memory) {
        uint256 tokenId = _requireRegistered(wallet);
        return profiles[tokenId];
    }

    /// @notice Returns the roles array for a wallet.
    function getRoles(address wallet) external view returns (Role[] memory) {
        uint256 tokenId = _requireRegistered(wallet);
        return profiles[tokenId].roles;
    }

    // ─── Soulbound: block all transfers ───────────────────────────────────────

    function _beforeTokenTransfer(
        address from,
        address, /* to */
        uint256, /* tokenId */
        uint256  /* batchSize */
    ) internal pure override {
        // Allow minting (from == address(0)) but block all other transfers
        if (from != address(0)) revert SoulboundToken();
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _requireRegistered(address wallet) internal view returns (uint256 tokenId) {
        tokenId = walletToToken[wallet];
        if (tokenId == 0) revert NotRegistered(wallet);
    }
}
