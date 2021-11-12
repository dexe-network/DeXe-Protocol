const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const TraderPoolFactory = artifacts.require("TraderPoolFactory");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const traderPoolFactory = await deployer.deploy(TraderPoolFactory);
  const traderPoolRegistry = await deployer.deploy(TraderPoolRegistry);

  logTransaction(
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_FACTORY_NAME(),
      traderPoolFactory.address
    ),
    "AddProxy TraderPoolFactory"
  );

  logTransaction(
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      traderPoolRegistry.address
    ),
    "AddProxy TraderPoolRegistry"
  );
};
