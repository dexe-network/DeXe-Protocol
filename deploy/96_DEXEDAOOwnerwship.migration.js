const config = require("./config/utils.js").getConfig();

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

  const owners = config.owners;
  owners.push(deployer.dexeDaoAddress);

  await expertNft.transferOwnership(deployer.dexeDaoAddress);

  await contractsRegistry.addOwners(owners);
  await poolRegistry.addOwners(owners);
  await coreProperties.addOwners(owners);
  await userRegistry.addOwners(owners);
  await priceFeed.addOwners(owners);

  await contractsRegistry.renounceOwnership();
  await poolRegistry.renounceOwnership();
  await coreProperties.renounceOwnership();
  await userRegistry.renounceOwnership();
  await priceFeed.renounceOwnership();
};
