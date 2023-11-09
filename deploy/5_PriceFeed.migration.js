const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UniswapPathFinderLib = artifacts.require("UniswapPathFinder");

const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  await deployer.deploy(UniswapPathFinderLib);
  await deployer.link(UniswapPathFinderLib, PriceFeed);

  const priceFeed = await deployer.deploy(PriceFeed);

  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), priceFeed.address),
    "AddProxy PriceFeed"
  );
};
