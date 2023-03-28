const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");

const Insurance = artifacts.require("Insurance");
const CoreProperties = artifacts.require("CoreProperties");
const UserRegistry = artifacts.require("UserRegistry");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());
  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

  logger.logTransaction(
    await contractsRegistry.transferOwnership(deployer.dexeDaoAddress),
    "Transfer ContractsRegistry ownership to GovPool"
  );
  logger.logTransaction(
    await poolRegistry.transferOwnership(deployer.dexeDaoAddress),
    "Transfer PoolRegistry ownership to GovPool"
  );
  logger.logTransaction(
    await insurance.transferOwnership(deployer.dexeDaoAddress),
    "Transfer Insurance ownership to GovPool"
  );
  logger.logTransaction(
    await coreProperties.transferOwnership(deployer.dexeDaoAddress),
    "Transfer CoreProperties ownership to GovPool"
  );
  logger.logTransaction(
    await userRegistry.transferOwnership(deployer.dexeDaoAddress),
    "Transfer UserRegistry ownership to GovPool"
  );
  logger.logTransaction(
    await priceFeed.transferOwnership(deployer.dexeDaoAddress),
    "Transfer PriceFeed ownership to GovPool"
  );
};
