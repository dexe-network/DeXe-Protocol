const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const coreProperties = await deployer.deploy("CoreProperties");
  const priceFeed = await deployer.deploy("PriceFeedMock");

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), coreProperties.address),
    "AddProxy CoreProperties"
  );

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), priceFeed.address),
    "AddProxy PriceFeed"
  );
};
