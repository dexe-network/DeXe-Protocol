const { logTransaction } = require("../runners/logger/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolRegistry = artifacts.require("PoolRegistry");

const GovPool = artifacts.require("GovPool");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  const govPool = await deployer.deploy(GovPool);
  const govSettings = await deployer.deploy(GovSettings);
  const govValidators = await deployer.deploy(GovValidators);
  const govUserKeeper = await deployer.deploy(GovUserKeeper);

  const govPoolName = await poolRegistry.GOV_POOL_NAME();
  const govSettingsName = await poolRegistry.SETTINGS_NAME();
  const govValidatorsName = await poolRegistry.VALIDATORS_NAME();
  const govUserKeeperName = await poolRegistry.USER_KEEPER_NAME();

  logTransaction(
    await poolRegistry.setNewImplementations(
      [govPoolName, govSettingsName, govValidatorsName, govUserKeeperName],
      [govPool.address, govSettings.address, govValidators.address, govUserKeeper.address]
    ),
    "Set GovPools implementations"
  );
};
