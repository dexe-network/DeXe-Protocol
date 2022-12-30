const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolFactory = artifacts.require("PoolFactory");
const GovTokenSaleDeployerLib = artifacts.require("GovTokenSaleDeployer");
const PoolRegistry = artifacts.require("PoolRegistry");

async function link(deployer) {
  await deployer.deploy(GovTokenSaleDeployerLib);

  await deployer.link(GovTokenSaleDeployerLib, PoolFactory);
}

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  await link(deployer);

  const poolFactory = await deployer.deploy(PoolFactory);
  const poolRegistry = await deployer.deploy(PoolRegistry);

  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), poolFactory.address),
    "AddProxy PoolFactory"
  );
  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), poolRegistry.address),
    "AddProxy PoolRegistry"
  );
};
