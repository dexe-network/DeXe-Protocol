const { PRECISION } = require("../scripts/utils/constants");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UserRegistry = artifacts.require("UserRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

const DexeExpertNft = artifacts.require("ERC721Expert");

const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");

const DEFAULT_CORE_PROPERTIES = {
  govVotesLimit: 20,
  govCommissionPercentage: PRECISION.times(20).toFixed(),
  tokenSaleProposalCommissionPercentage: PRECISION.toFixed(),
  micropoolVoteRewardsPercentage: PRECISION.times(20).toFixed(),
  treasuryVoteRewardsPercentage: PRECISION.times(1.618).toFixed(),
};

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

  const expertNft = await DexeExpertNft.at(await contractsRegistry.getDexeExpertNftContract());

  const poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());
  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  ////////////////////////////////////////////////////////////

  console.log();

  logger.logTransaction(
    await userRegistry.__UserRegistry_init(await contractsRegistry.USER_REGISTRY_NAME()),
    "Init UserRegistry"
  );

  logger.logTransaction(await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES), "Init CoreProperties");
  logger.logTransaction(await priceFeed.__PriceFeed_init(), "Init PriceFeed");

  logger.logTransaction(await expertNft.__ERC721Expert_init("Dexe Expert Nft", "DEXEXPNFT"), "Init ERC721Expert");

  logger.logTransaction(await poolRegistry.__OwnablePoolContractsRegistry_init(), "Init PoolRegistry");

  ////////////////////////////////////////////////////////////

  console.log();

  logger.logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME()),
    "Inject PriceFeed"
  );

  logger.logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME()),
    "Inject PoolFactory"
  );

  logger.logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME()),
    "Inject PoolRegistry"
  );

  ////////////////////////////////////////////////////////////

  logger.logContracts(
    ["ContractsRegistry", contractsRegistry.address],
    ["UserRegistry", userRegistry.address],
    ["CoreProperties", coreProperties.address],
    ["PriceFeed", priceFeed.address],
    ["ERC721Expert", expertNft.address],
    ["PoolFactory", poolFactory.address],
    ["PoolRegistry", poolRegistry.address]
  );
};
