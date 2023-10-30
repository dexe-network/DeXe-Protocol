const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolFactory = await deployer.deploy(PoolFactory);
  const poolRegistry = await deployer.deploy(PoolRegistry);

  await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), poolFactory.address);
  await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), poolRegistry.address);
};
