// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice ERC20 mock stablecoin used as the lending currency on the platform.
 *         Total supply: 10,000,000 USDC (6 decimals, matching real USDC).
 *         On deployment, 1,000,000 tokens are minted to the deployer (default lender).
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant INITIAL_SUPPLY = 10_000_000 * 10 ** 6;
    uint256 public constant LENDER_SEED    =  1_000_000 * 10 ** 6;

    constructor(address defaultLender) ERC20("Mock USDC", "mUSDC") {
        // Mint full supply to owner (treasury / faucet)
        _mint(msg.sender, INITIAL_SUPPLY - LENDER_SEED);
        // Seed the default lender wallet
        _mint(defaultLender, LENDER_SEED);
    }

    /// @notice Allows owner to mint additional tokens (faucet for testing)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }
}
