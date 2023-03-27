const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");

const GovPool = artifacts.require("GovPool");

const Insurance = artifacts.require("Insurance");
const CoreProperties = artifacts.require("CoreProperties");
const UserRegistry = artifacts.require("UserRegistry");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  const govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

  const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());
  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

  logger.logTransaction(
    await contractsRegistry.transferOwnership(govPool.address),
    "Transfer ContractsRegistry ownership to GovPool"
  );
  logger.logTransaction(
    await poolRegistry.transferOwnership(govPool.address),
    "Transfer PoolRegistry ownership to GovPool"
  );
  logger.logTransaction(await insurance.transferOwnership(govPool.address), "Transfer Insurance ownership to GovPool");
  logger.logTransaction(
    await coreProperties.transferOwnership(govPool.address),
    "Transfer CoreProperties ownership to GovPool"
  );
  logger.logTransaction(
    await userRegistry.transferOwnership(govPool.address),
    "Transfer UserRegistry ownership to GovPool"
  );
  logger.logTransaction(await priceFeed.transferOwnership(govPool.address), "Transfer PriceFeed ownership to GovPool");
};
