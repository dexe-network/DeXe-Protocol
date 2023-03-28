const config = require("./config/config.json");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

  let whitelistAddresses = [
    config.tokens.WBNB,
    config.tokens.USDT,
    config.tokens.WETH,
    config.tokens.BUSD,
    config.tokens.DAI,
    config.tokens.pancake,
  ];

  let blacklistAddresses = [config.tokens.SAFEMOON];

  let pathAddresses = [config.tokens.WBNB, config.tokens.USDT, config.tokens.BUSD];

  logger.logTransaction(await coreProperties.addWhitelistTokens(whitelistAddresses), "Add whitelist tokens");
  logger.logTransaction(await coreProperties.addBlacklistTokens(blacklistAddresses), "Add blacklist tokens");

  logger.logTransaction(await priceFeed.addPathTokens(pathAddresses), "Add supported path tokens");

  logger.logTransaction(
    await userRegistry.setPrivacyPolicyDocumentHash(config.userRegistry.documentHash),
    "Add document hash"
  );
};
