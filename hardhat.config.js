require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-truffle5");
require("@typechain/hardhat");
require("@solarity/hardhat-migrate");
require("@solarity/hardhat-markup");
require("@solarity/hardhat-gobind");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");

const dotenv = require("dotenv");
dotenv.config();

function privateKey() {
  return process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];
}

function typechainTarget() {
  const target = process.env.TYPECHAIN_TARGET;

  return target == "" || target == undefined ? "ethers-v5" : target;
}

function forceTypechain() {
  return process.env.TYPECHAIN_FORCE == "true";
}

module.exports = {
  networks: {
    hardhat: {
      initialDate: "1970-01-01T00:00:00Z",
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      initialDate: "1970-01-01T00:00:00Z",
      gasMultiplier: 1.2,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    sepoliaOptimism: {
      url: `https://optimism-sepolia.blockpi.network/v1/rpc/public`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    sepoliaBase: {
      url: `https://base-sepolia-rpc.publicnode.com`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    chapel: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: privateKey(),
      gasMultiplier: 1.2,
      gasPrice: 6000000000,
      timeout: 600000,
    },
    amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  etherscan: {
    apiKey: {
      mainnet: `${process.env.ETHERSCAN_KEY}`,
      goerli: `${process.env.ETHERSCAN_KEY}`,
      sepolia: `${process.env.ETHERSCAN_KEY}`,
      bsc: `${process.env.BSCSCAN_KEY}`,
      bscTestnet: `${process.env.BSCSCAN_KEY}`,
      polygonAmoy: `${process.env.POLYGONSCAN_KEY}`,
      sepoliaOptimism: `${process.env.OPTIMISM_KEY}`,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
      {
        network: "sepoliaOptimism",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://api-sepolia-optimistic.etherscan.io",
        },
      },
    ],
  },
  migrate: {
    pathToMigrations: "./deploy/",
  },
  markup: {
    onlyFiles: ["./contracts/interfaces"],
  },
  gobind: {
    onlyFiles: ["./contracts/"],
  },
  mocha: {
    timeout: 1000000,
  },
  contractSizer: {
    alphaSort: false,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: false,
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 50,
    enabled: false,
    coinmarketcap: `${process.env.COINMARKETCAP_KEY}`,
  },
  typechain: {
    outDir: `generated-types/${typechainTarget().split("-")[0]}`,
    target: typechainTarget(),
    alwaysGenerateOverloads: true,
    discriminateTypes: true,
    dontOverrideCompile: !forceTypechain(),
  },
};
