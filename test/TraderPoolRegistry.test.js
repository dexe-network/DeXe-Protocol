const { assert } = require("chai");
const { toBN, accounts } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const Insurance = artifacts.require("Insurance");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");

ContractsRegistry.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);
const DECIMAL = toBN(10).pow(18);

const ComissionPeriods = {
  PERIOD_1: 0,
  PERIOD_2: 1,
  PERIOD_3: 2,
};

const DEFAULT_CORE_PROPERTIES = {
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
  delayForRiskyPool: SECONDS_IN_DAY * 20,
  insuranceFactor: 10,
  maxInsurancePoolShare: 3,
  minInsuranceDeposit: DECIMAL.times(10).toFixed(),
  minInsuranceProposalAmount: DECIMAL.times(100).toFixed(),
  insuranceWithdrawalLock: SECONDS_IN_DAY,
};

describe("TraderPoolRegistry", () => {
  let OWNER;
  let FACTORY;
  let NOTHING;

  let BASIC_NAME;
  let INVEST_NAME;

  let DEXE;
  let traderPoolRegistry;

  before("setup", async () => {
    OWNER = await accounts(0);
    FACTORY = await accounts(1);
    NOTHING = await accounts(9);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();
    const traderPoolExchangeLib = await TraderPoolExchangeLib.new();

    await TraderPoolMock.link(traderPoolCommissionLib);
    await TraderPoolMock.link(traderPoolLeverageLib);
    await TraderPoolMock.link(traderPoolPriceLib);
    await TraderPoolMock.link(traderPoolExchangeLib);
    await TraderPoolMock.link(traderPoolViewLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 18);
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    const uniswapV2Router = await UniswapV2RouterMock.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), NOTHING);

    const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    const priceFeed = await PriceFeedMock.at(await contractsRegistry.getPriceFeedContract());
    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

    await insurance.__Insurance_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init();
    await traderPoolRegistry.__PoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());

    BASIC_NAME = await traderPoolRegistry.BASIC_POOL_NAME();
    INVEST_NAME = await traderPoolRegistry.INVEST_POOL_NAME();
  });

  async function deployPool(poolParameters) {
    const traderPool = await TraderPoolMock.new();

    await traderPool.__TraderPoolMock_init("Test pool", "TP", poolParameters);

    await traderPoolRegistry.addPool(BASIC_NAME, traderPool.address, {
      from: FACTORY,
    });
    await traderPoolRegistry.associateUserWithPool(OWNER, BASIC_NAME, traderPool.address, {
      from: FACTORY,
    });

    await traderPoolRegistry.injectDependenciesToExistingPools(BASIC_NAME, 0, 10);

    return traderPool;
  }

  describe("add and list pools", () => {
    let POOL_1;
    let POOL_2;
    let POOL_3;

    beforeEach("setup", async () => {
      POOL_1 = await accounts(3);
      POOL_2 = await accounts(4);
      POOL_3 = await accounts(5);
    });

    it("should successfully add and get implementation", async () => {
      await traderPoolRegistry.setNewImplementations([BASIC_NAME], [DEXE.address]);

      assert.equal(await traderPoolRegistry.getImplementation(BASIC_NAME), DEXE.address);
    });

    it("should successfully add new BASIC pools", async () => {
      assert.isFalse(await traderPoolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await traderPoolRegistry.isInvestPool(POOL_1));

      await traderPoolRegistry.addPool(BASIC_NAME, POOL_1, { from: FACTORY });
      await traderPoolRegistry.addPool(BASIC_NAME, POOL_2, { from: FACTORY });

      assert.equal((await traderPoolRegistry.countPools(BASIC_NAME)).toFixed(), "2");
      assert.equal((await traderPoolRegistry.countPools(INVEST_NAME)).toFixed(), "0");

      assert.isTrue(await traderPoolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await traderPoolRegistry.isInvestPool(POOL_1));

      assert.isFalse(await traderPoolRegistry.isPool(POOL_3));
      assert.isTrue(await traderPoolRegistry.isPool(POOL_2));
    });

    it("should successfully add new INVEST pools", async () => {
      assert.isFalse(await traderPoolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await traderPoolRegistry.isInvestPool(POOL_1));

      await traderPoolRegistry.addPool(INVEST_NAME, POOL_1, { from: FACTORY });
      await traderPoolRegistry.addPool(INVEST_NAME, POOL_2, { from: FACTORY });

      assert.equal((await traderPoolRegistry.countPools(INVEST_NAME)).toFixed(), "2");
      assert.equal((await traderPoolRegistry.countPools(BASIC_NAME)).toFixed(), "0");

      assert.isFalse(await traderPoolRegistry.isBasicPool(POOL_2));
      assert.isTrue(await traderPoolRegistry.isInvestPool(POOL_1));

      assert.isFalse(await traderPoolRegistry.isPool(POOL_3));
      assert.isTrue(await traderPoolRegistry.isPool(POOL_2));
    });

    it("should successfully associate new pools", async () => {
      await traderPoolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_1, { from: FACTORY });
      await traderPoolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_2, { from: FACTORY });

      assert.equal((await traderPoolRegistry.countTraderPools(OWNER, BASIC_NAME)).toFixed(), "2");
      assert.equal((await traderPoolRegistry.countTraderPools(OWNER, INVEST_NAME)).toFixed(), "0");
    });

    it("should list added pools", async () => {
      await traderPoolRegistry.addPool(BASIC_NAME, POOL_1, { from: FACTORY });
      await traderPoolRegistry.addPool(BASIC_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 2, 0), []);
      assert.deepEqual(await traderPoolRegistry.listPools(INVEST_NAME, 0, 2), []);
    });

    it("should list associated pools", async () => {
      await traderPoolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_1, { from: FACTORY });
      await traderPoolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await traderPoolRegistry.listTraderPools(OWNER, BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listTraderPools(OWNER, BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listTraderPools(OWNER, BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listTraderPools(OWNER, BASIC_NAME, 2, 0), []);
      assert.deepEqual(await traderPoolRegistry.listTraderPools(OWNER, INVEST_NAME, 0, 2), []);
    });
  });

  describe("get info from real pools", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: DEXE.address,
        baseTokenDecimals: 8,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      await deployPool(POOL_PARAMETERS);
      await deployPool(POOL_PARAMETERS);
    });

    it("should get info", async () => {
      await truffleAssert.passes(await traderPoolRegistry.listPoolsWithInfo(BASIC_NAME, 0, 10), "passes");
      await truffleAssert.passes(await traderPoolRegistry.listPoolsWithInfo(INVEST_NAME, 0, 10), "passes");

      assert.equal((await traderPoolRegistry.listPoolsWithInfo(BASIC_NAME, 0, 1)).pools.length, 1);
      assert.equal((await traderPoolRegistry.listPoolsWithInfo(INVEST_NAME, 0, 1)).pools.length, 0);
    });
  });
});
