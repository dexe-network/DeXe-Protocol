const ContractsRegistry = artifacts.require("ContractsRegistry");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const priceFeed = await deployer.deploy(PriceFeed);

  await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), priceFeed.address);
};
