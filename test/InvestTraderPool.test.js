const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setNextBlockTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const RiskyTraderPool = artifacts.require("RiskyTraderPool");
const TraderPoolFactory = artifacts.require("TraderPoolFactory");
const TraderPoolHelperLib = artifacts.require("TraderPoolHelper");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
RiskyTraderPool.numberFormat = "BigNumber";
TraderPoolFactory.numberFormat = "BigNumber";
TraderPoolHelperLib.numberFormat = "BigNumber";

const truffleAssert = require("truffle-assertions");

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);

const ComissionPeriods = {
  PERIOD_1: 0,
  PERIOD_2: 1,
  PERIOD_3: 2,
};

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

describe("InvestTraderPool", () => {
  let OWNER;
  let SECOND;
  let NOTHING;

  let traderPoolFactory;

  let testCoin;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    NOTHING = await accounts(3);

    const traderPoolHelper = await TraderPoolHelperLib.new();

    await RiskyTraderPool.link(traderPoolHelper);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();

    const _coreProperties = await CoreProperties.new(DEFAULT_CORE_PROPERTIES);
    const _priceFeed = await PriceFeed.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _traderPoolFactory = await TraderPoolFactory.new();
    testCoin = await ERC20Mock.new("TestCoin", "TS", 18);

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_FACTORY_NAME(),
      _traderPoolFactory.address
    );

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
    traderPoolFactory = await TraderPoolFactory.at(await contractsRegistry.getTraderPoolFactoryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await traderPoolRegistry.__TraderPoolRegistry_init();
    await priceFeed.__PriceFeed_init();
    await traderPoolFactory.__TraderPoolFactory_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_FACTORY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    let _riskyTraderPool = await RiskyTraderPool.new();

    const poolNames = [
      await traderPoolRegistry.INVEST_POOL_NAME(),
      await traderPoolRegistry.RISKY_POOL_NAME(),
      await traderPoolRegistry.BASIC_POOL_NAME(),
    ];

    const poolAddrs = [_riskyTraderPool.address, _riskyTraderPool.address, _riskyTraderPool.address];

    await traderPoolRegistry.setNewImplementations(poolNames, poolAddrs);

    await priceFeed.addSupportedBaseTokens([testCoin.address]);
  });

  describe("invest", () => {
    let POOL_PARAMETERS = {};

    let riskyPool;

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };

      let tx = await traderPoolFactory.deployRiskyPool("Risky Pool", "RP", POOL_PARAMETERS);
      let event = tx.logs[0];

      riskyPool = await RiskyTraderPool.at(event.args.at);
    });

    it("should revert when investing from non trader address", async () => {
      await truffleAssert.reverts(riskyPool.invest(100, { from: SECOND }), "RTP: investment delay");
    });

    it("should revert when investing before exchange", async () => {
      await testCoin.mint(SECOND, 100);
      await testCoin.approve(riskyPool.address, 100, { from: SECOND });

      await truffleAssert.reverts(riskyPool.invest(100, { from: SECOND }), "RTP: investment delay");
    });

    it("should revert when investing with delay", async () => {
      await testCoin.mint(OWNER, 100);
      await testCoin.approve(riskyPool.address, 100);

      await riskyPool.invest(100);

      await testCoin.mint(SECOND, 100);
      await testCoin.approve(riskyPool.address, 100, { from: SECOND });

      let token = await ERC20Mock.new("test", "TS", 100);

      await riskyPool.exchange(testCoin.address, token.address, 100);

      await truffleAssert.reverts(riskyPool.invest(100, { from: SECOND }), "RTP: investment delay");
    });

    it("should invest after delay", async () => {
      await testCoin.mint(OWNER, 100);
      await testCoin.approve(riskyPool.address, 100);

      await riskyPool.invest(100);

      await testCoin.mint(SECOND, 100);
      await testCoin.approve(riskyPool.address, 100, { from: SECOND });

      let token = await ERC20Mock.new("Test", "TS", 100);

      await riskyPool.exchange(testCoin.address, token.address, 100);

      await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

      await truffleAssert.passes(riskyPool.invest(100, { from: SECOND }), "Invested");
    });
  });
});
