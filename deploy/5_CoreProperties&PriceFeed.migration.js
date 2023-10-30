const ContractsRegistry = artifacts.require("ContractsRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const coreProperties = await deployer.deploy(CoreProperties);
  const priceFeed = await deployer.deploy(PriceFeed);

  await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), coreProperties.address);
  await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), priceFeed.address);
};
