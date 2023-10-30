const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const UserRegistry = artifacts.require("UserRegistry");
const PriceFeed = artifacts.require("PriceFeed");
const DexeExpertNft = artifacts.require("ERC721Expert");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolRegistry = await deployer.deployed(PoolRegistry, await contractsRegistry.getPoolRegistryContract());

  const coreProperties = await deployer.deployed(CoreProperties, await contractsRegistry.getCorePropertiesContract());
  const userRegistry = await deployer.deployed(UserRegistry, await contractsRegistry.getUserRegistryContract());
  const priceFeed = await deployer.deployed(PriceFeed, await contractsRegistry.getPriceFeedContract());
  const expertNft = await deployer.deployed(DexeExpertNft, await contractsRegistry.getDexeExpertNftContract());

  await contractsRegistry.transferOwnership(deployer.dexeDaoAddress);
  await poolRegistry.transferOwnership(deployer.dexeDaoAddress);
  await coreProperties.transferOwnership(deployer.dexeDaoAddress);
  await userRegistry.transferOwnership(deployer.dexeDaoAddress);
  await priceFeed.transferOwnership(deployer.dexeDaoAddress);
  await expertNft.transferOwnership(deployer.dexeDaoAddress);
};
