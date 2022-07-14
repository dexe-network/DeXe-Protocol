const { logTransaction } = require("../runners/logger/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const GovPoolRegistry = artifacts.require("GovPoolRegistry");

const GovPool = artifacts.require("GovPool");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const govPoolRegistry = await GovPoolRegistry.at(await contractsRegistry.getGovPoolRegistryContract());

  const govPool = await deployer.deploy(GovPool);
  const govSettings = await deployer.deploy(GovSettings);
  const govValidators = await deployer.deploy(GovValidators);
  const govUserKeeper = await deployer.deploy(GovUserKeeper);

  const govPoolName = await govPoolRegistry.GOV_POOL_NAME();
  const govSettingsName = await govPoolRegistry.SETTINGS_NAME();
  const govValidatorsName = await govPoolRegistry.VALIDATORS_NAME();
  const govUserKeeperName = await govPoolRegistry.USER_KEEPER_NAME();

  logTransaction(
    await govPoolRegistry.setNewImplementations(
      [govPoolName, govSettingsName, govValidatorsName, govUserKeeperName],
      [govPool.address, govSettings.address, govValidators.address, govUserKeeper.address]
    ),
    "Set GovPools implementations"
  );
};
