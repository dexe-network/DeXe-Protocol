const { logTransaction } = require("../runners/logger/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolFactory = artifacts.require("PoolFactory");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const GovPoolRegistry = artifacts.require("GovPoolRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolFactory = await deployer.deploy(PoolFactory);
  const traderPoolRegistry = await deployer.deploy(TraderPoolRegistry);
  const govPoolRegistry = await deployer.deploy(GovPoolRegistry);

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), poolFactory.address),
    "AddProxy PoolFactory"
  );

  logTransaction(
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      traderPoolRegistry.address
    ),
    "AddProxy TraderPoolRegistry"
  );
  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.GOV_POOL_REGISTRY_NAME(), govPoolRegistry.address),
    "AddProxy GovPoolRegistry"
  );
};
