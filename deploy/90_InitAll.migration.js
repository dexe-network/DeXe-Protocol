const { Reporter } = require("@solarity/hardhat-migrate");

const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");
const UserRegistry = artifacts.require("UserRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const DexeExpertNft = artifacts.require("ERC721Expert");
const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");
const SphereXEngine = artifacts.require("SphereXEngine");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const userRegistry = await deployer.deployed(UserRegistry, await contractsRegistry.getUserRegistryContract());
  const coreProperties = await deployer.deployed(CoreProperties, await contractsRegistry.getCorePropertiesContract());

  const priceFeed = await deployer.deployed(PriceFeed, await contractsRegistry.getPriceFeedContract());

  const expertNft = await deployer.deployed(DexeExpertNft, await contractsRegistry.getDexeExpertNftContract());

  const poolFactory = await deployer.deployed(PoolFactory, await contractsRegistry.getPoolFactoryContract());
  const poolRegistry = await deployer.deployed(PoolRegistry, await contractsRegistry.getPoolRegistryContract());

  const sphereXEngine = await deployer.deployed(SphereXEngine, await contractsRegistry.getSphereXEngineContract());
  const poolSphereXEngine = await deployer.deployed(
    SphereXEngine,
    await contractsRegistry.getPoolSphereXEngineContract(),
  );

  ////////////////////////////////////////////////////////////

  await userRegistry.__UserRegistry_init(await contractsRegistry.USER_REGISTRY_NAME());

  await coreProperties.__CoreProperties_init(config.DEFAULT_CORE_PROPERTIES);

  await priceFeed.__PriceFeed_init(config.DEFAULT_POOL_TYPES);

  await expertNft.__ERC721Expert_init("DeXe Protocol Global Expert NFT", "DPGEXPNFT");

  await poolRegistry.__MultiOwnablePoolContractsRegistry_init();

  ////////////////////////////////////////////////////////////

  await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());

  await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME());
  await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());

  ////////////////////////////////////////////////////////////

  Reporter.reportContracts(
    ["ContractsRegistry", contractsRegistry.address],
    ["UserRegistry", userRegistry.address],
    ["CoreProperties", coreProperties.address],
    ["PriceFeed", priceFeed.address],
    ["ERC721Expert", expertNft.address],
    ["PoolFactory", poolFactory.address],
    ["PoolRegistry", poolRegistry.address],
    ["SphereXEngine", sphereXEngine.address],
    ["PoolSphereXEngine", poolSphereXEngine.address],
  );
};
