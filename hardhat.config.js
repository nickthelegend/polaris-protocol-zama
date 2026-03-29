require("@nomicfoundation/hardhat-toolbox");
require("@fhevm/hardhat-plugin");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: "https://1rpc.io/sepolia",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    zama_testnet: {
      url: "https://relayer.testnet.zama.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 10901,
    },
    baseSepolia: {
      url: "https://base-sepolia.api.onfinality.io/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    monadTestnet: {
      url: "https://testnet-rpc.monad.xyz/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 20143,
    },
    cronosTestnet: {
      url: "https://evm-t3.cronos.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 338,
    },
  },
  fhevm: {
    gateway: {
      url: "https://relayer.testnet.zama.org",
      chainId: 10901,
      addresses: {
        FHEVM_EXECUTOR: "0x92C920834Ec8941d2C77D188936E1f7A6f49c127",
        ACL: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
        KMS_VERIFIER: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
        INPUT_VERIFIER: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
      },
    },
  },
};
