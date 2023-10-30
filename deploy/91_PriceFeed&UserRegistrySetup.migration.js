const config = require("./config/config.json");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PriceFeed = artifacts.require("PriceFeed");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const priceFeed = await deployer.deployed(PriceFeed, await contractsRegistry.getPriceFeedContract());
  const userRegistry = await deployer.deployed(UserRegistry, await contractsRegistry.getUserRegistryContract());

  let pathAddresses = [config.tokens.WBNB, config.tokens.USDT, config.tokens.BUSD];

  await priceFeed.addPathTokens(pathAddresses);
  await userRegistry.setPrivacyPolicyDocumentHash(config.userRegistry.documentHash);
};
