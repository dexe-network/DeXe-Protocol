const { toBN } = require("../../scripts/helpers/utils");
const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

const Insurance = artifacts.require("Insurance");

const TraderPoolFactory = artifacts.require("TraderPoolFactory");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);

const DEFAULT_CORE_PROPERTIES = {
  maximumPoolInvestors: 1000,
  maximumOpenPositions: 25,
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
  minimalTraderCommission: PRECISION.times(20).toFixed(),
  maximalTraderCommissions: [
    PRECISION.times(30).toFixed(),
    PRECISION.times(50).toFixed(),
    PRECISION.times(70).toFixed(),
  ],
  delayForRiskyPool: SECONDS_IN_DAY * 20,
};

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

  const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());

  const traderPoolFactory = await TraderPoolFactory.at(await contractsRegistry.getTraderPoolFactoryContract());
  const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

  ////////////////////////////////////////////////////////////

  console.log();

  logTransaction(await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES), "Init CoreProperties");
  logTransaction(await priceFeed.__PriceFeed_init(), "Init PriceFeed");

  logTransaction(await insurance.__Insurance_init(), "Init Insurance");

  logTransaction(await traderPoolFactory.__TraderPoolFactory_init(), "Init TraderPoolFactory");
  logTransaction(await traderPoolRegistry.__TraderPoolRegistry_init(), "Init TraderPoolRegistry");

  ////////////////////////////////////////////////////////////

  console.log();

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME()),
    "Inject PriceFeed"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME()),
    "Inject Insurance"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_FACTORY_NAME()),
    "Inject TraderPoolFactory"
  );

  logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME()),
    "Inject TraderPoolRegistry"
  );
};
