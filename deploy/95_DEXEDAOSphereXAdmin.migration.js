const { Reporter } = require("@solarity/hardhat-migrate");

const config = require("./config/utils.js").getConfig();

const { accounts } = require("../scripts/utils/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const SphereXProtectedBase = artifacts.require("ProtectedTransparentProxy");
const SphereXEngine = artifacts.require("SphereXEngine");
const GovPoolMigration = artifacts.require("GovPoolMigration");

module.exports = async (deployer) => {
  const DEPLOYER = await accounts(0);

  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolRegistry = await deployer.deployed(PoolRegistry, await contractsRegistry.getPoolRegistryContract());

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

  const engines = [
    ["GlobalEngine", await contractsRegistry.getSphereXEngineContract()],
    ["PoolEngine", await contractsRegistry.getPoolSphereXEngineContract()],
  ];

  Reporter.reportContracts(...proxies);
  Reporter.reportContracts(...engines);

  const govPoolImplementation = await poolRegistry.getImplementation(await poolRegistry.GOV_POOL_NAME());
  const govPoolMigration = (await deployer.deploy(GovPoolMigration)).address;

  await poolRegistry.setNewImplementations([await poolRegistry.GOV_POOL_NAME()], [govPoolMigration]);

  for (const [, proxy] of proxies) {
    await (await deployer.deployed(SphereXProtectedBase, proxy)).transferSphereXAdminRole(deployer.dexeDaoAddress);
  }

  for (const [, engine] of engines) {
    const instance = await deployer.deployed(SphereXEngine, engine);

    for (const owner of config.owners) {
      await instance.grantRole(await instance.OPERATOR_ROLE(), owner);
    }

    await instance.grantRole(await instance.OPERATOR_ROLE(), deployer.dexeDaoAddress);
    await instance.renounceRole(await instance.OPERATOR_ROLE(), DEPLOYER);

    await instance.beginDefaultAdminTransfer(deployer.dexeDaoAddress);
  }

  const migration = await deployer.deployed(GovPoolMigration, deployer.dexeDaoAddress);

  await migration.acceptSphereXAdmins(proxies.map((e) => e[1]));
  await migration.acceptSphereXEngines(engines.map((e) => e[1]));

  await poolRegistry.setNewImplementations([await poolRegistry.GOV_POOL_NAME()], [govPoolImplementation]);
};
