const { logTransaction } = require("../runners/logger/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolFactory = await deployer.deploy(PoolFactory);
  const poolRegistry = await deployer.deploy(PoolRegistry);

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), poolFactory.address),
    "AddProxy PoolFactory"
  );
  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), poolRegistry.address),
    "AddProxy PoolRegistry"
  );
};
