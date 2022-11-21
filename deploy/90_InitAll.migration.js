const { logTransaction, logContracts } = require("@dlsl/hardhat-migrate/dist/src/logger/logger.js");

const { SECONDS_IN_DAY, SECONDS_IN_MONTH, PRECISION, DECIMAL } = require("../scripts/utils/constants");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UserRegistry = artifacts.require("UserRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

const Insurance = artifacts.require("Insurance");

const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");

const DEFAULT_CORE_PROPERTIES = {
  traderParams: {
    maxPoolInvestors: 1000,
    maxOpenPositions: 25,
    leverageThreshold: 2500,
    leverageSlope: 5,
    commissionInitTimestamp: 0,
    commissionDurations: [SECONDS_IN_MONTH, SECONDS_IN_MONTH * 3, SECONDS_IN_MONTH * 12],
    dexeCommissionPercentage: PRECISION.times(30).toFixed(),
    dexeCommissionDistributionPercentages: [
      PRECISION.times(33).toFixed(),
      PRECISION.times(33).toFixed(),
      PRECISION.times(33).toFixed(),
    ],
    minTraderCommission: PRECISION.times(20).toFixed(),
    maxTraderCommissions: [PRECISION.times(30).toFixed(), PRECISION.times(50).toFixed(), PRECISION.times(70).toFixed()],
    delayForRiskyPool: 0,
  },
  insuranceParams: {
    insuranceFactor: 10,
    maxInsurancePoolShare: PRECISION.times(33.3333).toFixed(),
    minInsuranceDeposit: DECIMAL.times(10).toFixed(),
    insuranceWithdrawalLock: SECONDS_IN_DAY,
  },
  govParams: {
    govVotesLimit: 20,
    govCommissionPercentage: PRECISION.times(20).toFixed(),
  },
};

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

  const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());

  const poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());
  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  ////////////////////////////////////////////////////////////

  console.log();

  logTransaction(
    await userRegistry.__UserRegistry_init(await contractsRegistry.USER_REGISTRY_NAME()),
    "Init UserRegistry"
  );

  logTransaction(await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES), "Init CoreProperties");
  logTransaction(await priceFeed.__PriceFeed_init(), "Init PriceFeed");

  logTransaction(await insurance.__Insurance_init(), "Init Insurance");

  logTransaction(await poolRegistry.__OwnablePoolContractsRegistry_init(), "Init PoolRegistry");

  ////////////////////////////////////////////////////////////

  console.log();

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME()),
    "Inject CoreProperties"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME()),
    "Inject PriceFeed"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME()),
    "Inject Insurance"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME()),
    "Inject PoolFactory"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME()),
    "Inject PoolRegistry"
  );

  ////////////////////////////////////////////////////////////

  logContracts(
    ["ContractsRegistry", contractsRegistry.address],
    ["UserRegistry", userRegistry.address],
    ["CoreProperties", coreProperties.address],
    ["PriceFeed", priceFeed.address],
    ["Insurance", insurance.address],
    ["PoolFactory", poolFactory.address],
    ["PoolRegistry", poolRegistry.address]
  );
};
