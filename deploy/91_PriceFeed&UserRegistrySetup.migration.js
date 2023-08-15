const config = require("./config/config.json");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PriceFeed = artifacts.require("PriceFeed");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

  let pathAddresses = [config.tokens.WBNB, config.tokens.USDT, config.tokens.BUSD];

  logger.logTransaction(await priceFeed.addPathTokens(pathAddresses), "Add supported path tokens");

  logger.logTransaction(
    await userRegistry.setPrivacyPolicyDocumentHash(config.userRegistry.documentHash),
    "Add document hash"
  );
};
