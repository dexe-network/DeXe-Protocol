const { logTransaction } = require("@dlsl/hardhat-migrate");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

  let whitelistAddresses = [
    "0x0B306BF915C4d645ff596e518fAf3F9669b97016", // WBNB
    "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707", // USDT
    "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1", // WETH
    "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE", // pancake
  ];

  let blacklistAddresses = [
    "0x68B1D87F95878fE05B998F19b66F4baba5De1aed", // SAFEMOON
  ];

  let pathAddresses = [
    "0x0B306BF915C4d645ff596e518fAf3F9669b97016", // WBNB
    "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707", // USDT
    "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE", // CAKE
  ];

  let documentHash = "0xdcf5635e2f38018583c7faa2aebd3361ed82c67c59c6a54de06b19181a596210";

  logTransaction(await coreProperties.addWhitelistTokens(whitelistAddresses), "Add whitelist tokens");
  logTransaction(await coreProperties.addBlacklistTokens(blacklistAddresses), "Add blacklist tokens");

  logTransaction(await priceFeed.addPathTokens(pathAddresses), "Add supported path tokens");

  logTransaction(await userRegistry.setPrivacyPolicyDocumentHash(documentHash), "Add document hash");
};
