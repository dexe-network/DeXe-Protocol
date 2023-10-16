const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const SphereXProtectedBase = artifacts.require("ProtectedTransparentProxy");
const GovPool = artifacts.require("GovPool");
const GovPoolMigration = artifacts.require("GovPoolMigration");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  const proxies = [
    ["PoolRegistry", poolRegistry.address],
    ["UserRegistry", await contractsRegistry.getUserRegistryContract()],
    ["PoolFactory", await contractsRegistry.getPoolFactoryContract()],
    ["DexeExpertNft", await contractsRegistry.getDexeExpertNftContract()],
    ["PriceFeed", await contractsRegistry.getPriceFeedContract()],
    ["CoreProperties", await contractsRegistry.getCorePropertiesContract()],
    ["GovPool", await poolRegistry.getProxyBeacon(await poolRegistry.GOV_POOL_NAME())],
    ["GovSettings", await poolRegistry.getProxyBeacon(await poolRegistry.SETTINGS_NAME())],
    ["GovValidators", await poolRegistry.getProxyBeacon(await poolRegistry.VALIDATORS_NAME())],
    ["GovUserKeeper", await poolRegistry.getProxyBeacon(await poolRegistry.USER_KEEPER_NAME())],
    ["DistributionProposal", await poolRegistry.getProxyBeacon(await poolRegistry.DISTRIBUTION_PROPOSAL_NAME())],
    ["TokenSaleProposal", await poolRegistry.getProxyBeacon(await poolRegistry.TOKEN_SALE_PROPOSAL_NAME())],
    ["ExpertNft", await poolRegistry.getProxyBeacon(await poolRegistry.EXPERT_NFT_NAME())],
    ["NftMultiplier", await poolRegistry.getProxyBeacon(await poolRegistry.NFT_MULTIPLIER_NAME())],
    ["LinearPower", await poolRegistry.getProxyBeacon(await poolRegistry.LINEAR_POWER_NAME())],
    ["PolynomialPower", await poolRegistry.getProxyBeacon(await poolRegistry.POLYNOMIAL_POWER_NAME())],
  ];

  logger.logContracts(...proxies);

  for (const [contractName, proxy] of proxies) {
    logger.logTransaction(
      await (await SphereXProtectedBase.at(proxy)).transferSphereXAdminRole(deployer.dexeDaoAddress),
      `Transferring a SphereX admin role for the ${contractName} proxy`
    );
  }

  logger.logTransaction(
    await (await GovPoolMigration.at(deployer.dexeDaoAddress)).acceptSphereXAdmins(proxies.map((e) => e[1])),
    "Accepting SphereX admin roles"
  );

  logger.logTransaction(
    await poolRegistry.setNewImplementations(
      [await poolRegistry.GOV_POOL_NAME()],
      [(await GovPool.deployed()).address]
    ),
    "Setting a default GovPool implementation"
  );
};
