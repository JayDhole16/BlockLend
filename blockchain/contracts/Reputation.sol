// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./UserProfileNFT.sol";

/**
 * @title Reputation
 * @notice Updates on-chain reputation scores after loan repayment or default.
 *
 * Scoring rules:
 *   - Repayment: +5 points (capped at 100)
 *   - Default:   -20 points (floored at 0)
 *
 * Only the Escrow contract (or owner) can call recordRepayment / recordDefault.
 */
contract Reputation is Ownable {
    // ─── State ────────────────────────────────────────────────────────────────

    UserProfileNFT public immutable profileNFT;

    /// Authorized callers (Escrow contract)
    mapping(address => bool) public authorized;

    uint256 public constant REPAYMENT_BONUS = 5;
    uint256 public constant DEFAULT_PENALTY = 20;
    uint256 public constant MAX_SCORE       = 100;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ReputationIncreased(address indexed wallet, uint256 oldScore, uint256 newScore);
    event ReputationDecreased(address indexed wallet, uint256 oldScore, uint256 newScore);
    event AuthorizedCallerSet(address indexed caller, bool status);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error Unauthorized(address caller);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized(msg.sender);
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _profileNFT) {
        profileNFT = UserProfileNFT(_profileNFT);
    }

    // ─── External ─────────────────────────────────────────────────────────────

    /// @notice Grant or revoke authorization (e.g. Escrow contract).
    function setAuthorized(address caller, bool status) external onlyOwner {
        authorized[caller] = status;
        emit AuthorizedCallerSet(caller, status);
    }

    /**
     * @notice Called by Escrow when a borrower successfully repays.
     *         Increases reputation by REPAYMENT_BONUS, capped at MAX_SCORE.
     */
    function recordRepayment(address borrower) external onlyAuthorized {
        UserProfileNFT.UserProfile memory profile = profileNFT.getProfile(borrower);
        uint256 oldScore = profile.reputationScore;
        uint256 newScore = oldScore + REPAYMENT_BONUS > MAX_SCORE
            ? MAX_SCORE
            : oldScore + REPAYMENT_BONUS;

        profileNFT.updateReputation(borrower, newScore);
        emit ReputationIncreased(borrower, oldScore, newScore);
    }

    /**
     * @notice Called by Escrow when a loan is marked as defaulted.
     *         Decreases reputation by DEFAULT_PENALTY, floored at 0.
     */
    function recordDefault(address borrower) external onlyAuthorized {
        UserProfileNFT.UserProfile memory profile = profileNFT.getProfile(borrower);
        uint256 oldScore = profile.reputationScore;
        uint256 newScore = oldScore < DEFAULT_PENALTY ? 0 : oldScore - DEFAULT_PENALTY;

        profileNFT.updateReputation(borrower, newScore);
        emit ReputationDecreased(borrower, oldScore, newScore);
    }

    /// @notice Read current reputation score for any wallet.
    function getScore(address wallet) external view returns (uint256) {
        return profileNFT.getProfile(wallet).reputationScore;
    }
}
