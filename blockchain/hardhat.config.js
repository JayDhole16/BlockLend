require("@nomicfoundation/hardhat-toolbox");

// 10 deterministic test accounts, each funded with 100 ETH
// These are Hardhat's default mnemonic accounts — safe for local use only
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: TEST_MNEMONIC,
        count: 10,
        accountsBalance: "100000000000000000000", // 100 ETH in wei
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: {
        mnemonic: TEST_MNEMONIC,
        count: 10,
      },
    },
  },
};
