const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  await deployer.deploy(UniswapV2PathFinderLib);

  await deployer.link(UniswapV2PathFinderLib, PriceFeed);

  const coreProperties = await deployer.deploy(CoreProperties);
  const priceFeed = await deployer.deploy(PriceFeed);

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), coreProperties.address),
    "AddProxy CoreProperties"
  );

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), priceFeed.address),
    "AddProxy PriceFeed"
  );
};
