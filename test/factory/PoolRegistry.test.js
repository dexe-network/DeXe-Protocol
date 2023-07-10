const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { PRECISION } = require("../../scripts/utils/constants");
const { ComissionPeriods, DEFAULT_CORE_PROPERTIES } = require("../utils/constants");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
const Insurance = artifacts.require("Insurance");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolInvestLib = artifacts.require("TraderPoolInvest");
const TraderPoolDivestLib = artifacts.require("TraderPoolDivest");
const TraderPoolModifyLib = artifacts.require("TraderPoolModify");
const TraderPoolViewLib = artifacts.require("TraderPoolView");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";

describe("PoolRegistry", () => {
  let OWNER;
  let FACTORY;
  let NOTHING;

  let BASIC_NAME;
  let INVEST_NAME;
  let GOV_NAME;

  let DEXE;
  let poolRegistry;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    FACTORY = await accounts(1);
    NOTHING = await accounts(9);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolDivestLib.link(traderPoolCommissionLib);
    await TraderPoolDivestLib.link(traderPoolPriceLib);

    await TraderPoolInvestLib.link(traderPoolPriceLib);
    await TraderPoolInvestLib.link(traderPoolLeverageLib);

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();
    const traderPoolExchangeLib = await TraderPoolExchangeLib.new();
    const traderPoolInvestLib = await TraderPoolInvestLib.new();
    const traderPoolDivestLib = await TraderPoolDivestLib.new();
    const traderPoolModifyLib = await TraderPoolModifyLib.new();

    await TraderPoolMock.link(traderPoolCommissionLib);
    await TraderPoolMock.link(traderPoolLeverageLib);
    await TraderPoolMock.link(traderPoolExchangeLib);
    await TraderPoolMock.link(traderPoolInvestLib);
    await TraderPoolMock.link(traderPoolDivestLib);
    await TraderPoolMock.link(traderPoolModifyLib);
    await TraderPoolMock.link(traderPoolViewLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _poolRegistry = await PoolRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 18);
    const BABT = await BABTMock.new();
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    const uniswapV2Router = await UniswapV2RouterMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), BABT.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), NOTHING);

    const insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    const priceFeed = await PriceFeedMock.at(await contractsRegistry.getPriceFeedContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await insurance.__Insurance_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init();
    await poolRegistry.__OwnablePoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());

    BASIC_NAME = await poolRegistry.BASIC_POOL_NAME();
    INVEST_NAME = await poolRegistry.INVEST_POOL_NAME();
    GOV_NAME = await poolRegistry.GOV_POOL_NAME();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  async function deployPool(poolParameters) {
    const traderPool = await TraderPoolMock.new();

    await traderPool.__TraderPoolMock_init("Test pool", "TP", poolParameters);

    await poolRegistry.addProxyPool(BASIC_NAME, traderPool.address, {
      from: FACTORY,
    });
    await poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, traderPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(BASIC_NAME, 0, 10);

    return traderPool;
  }

  describe("access", () => {
    it("only factory should call these methods", async () => {
      await truffleAssert.reverts(
        poolRegistry.addProxyPool(BASIC_NAME, OWNER),
        "PoolRegistry: Caller is not a factory"
      );

      await truffleAssert.reverts(
        poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, OWNER),
        "PoolRegistry: Caller is not a factory"
      );
    });
  });

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
      await poolRegistry.setNewImplementations([BASIC_NAME], [DEXE.address]);

      assert.equal(await poolRegistry.getImplementation(BASIC_NAME), DEXE.address);
    });

    it("should successfully add new BASIC pools", async () => {
      assert.isFalse(await poolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await poolRegistry.isInvestPool(POOL_1));

      await poolRegistry.addProxyPool(BASIC_NAME, POOL_1, { from: FACTORY });
      await poolRegistry.addProxyPool(BASIC_NAME, POOL_2, { from: FACTORY });

      assert.equal((await poolRegistry.countPools(BASIC_NAME)).toFixed(), "2");
      assert.equal((await poolRegistry.countPools(INVEST_NAME)).toFixed(), "0");

      assert.isTrue(await poolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await poolRegistry.isInvestPool(POOL_1));

      assert.isFalse(await poolRegistry.isTraderPool(POOL_3));
      assert.isTrue(await poolRegistry.isTraderPool(POOL_2));
    });

    it("should successfully add new INVEST pools", async () => {
      assert.isFalse(await poolRegistry.isBasicPool(POOL_2));
      assert.isFalse(await poolRegistry.isInvestPool(POOL_1));

      await poolRegistry.addProxyPool(INVEST_NAME, POOL_1, { from: FACTORY });
      await poolRegistry.addProxyPool(INVEST_NAME, POOL_2, { from: FACTORY });

      assert.equal((await poolRegistry.countPools(INVEST_NAME)).toFixed(), "2");
      assert.equal((await poolRegistry.countPools(BASIC_NAME)).toFixed(), "0");

      assert.isFalse(await poolRegistry.isBasicPool(POOL_2));
      assert.isTrue(await poolRegistry.isInvestPool(POOL_1));

      assert.isFalse(await poolRegistry.isTraderPool(POOL_3));
      assert.isTrue(await poolRegistry.isTraderPool(POOL_2));
    });

    it("should successfully add new GOV pool", async () => {
      assert.isFalse(await poolRegistry.isGovPool(POOL_2));

      await poolRegistry.addProxyPool(GOV_NAME, POOL_2, { from: FACTORY });

      assert.equal((await poolRegistry.countPools(GOV_NAME)).toFixed(), "1");

      assert.isTrue(await poolRegistry.isGovPool(POOL_2));
    });

    it("should successfully associate new pools", async () => {
      await poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_1, { from: FACTORY });
      await poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_2, { from: FACTORY });

      assert.equal((await poolRegistry.countAssociatedPools(OWNER, BASIC_NAME)).toFixed(), "2");
      assert.equal((await poolRegistry.countAssociatedPools(OWNER, INVEST_NAME)).toFixed(), "0");
    });

    it("should list added pools", async () => {
      await poolRegistry.addProxyPool(BASIC_NAME, POOL_1, { from: FACTORY });
      await poolRegistry.addProxyPool(BASIC_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await poolRegistry.listPools(BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await poolRegistry.listPools(BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await poolRegistry.listPools(BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await poolRegistry.listPools(BASIC_NAME, 2, 0), []);
      assert.deepEqual(await poolRegistry.listPools(INVEST_NAME, 0, 2), []);
    });

    it("should list associated pools", async () => {
      await poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_1, { from: FACTORY });
      await poolRegistry.associateUserWithPool(OWNER, BASIC_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await poolRegistry.listAssociatedPools(OWNER, BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await poolRegistry.listAssociatedPools(OWNER, BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await poolRegistry.listAssociatedPools(OWNER, BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await poolRegistry.listAssociatedPools(OWNER, BASIC_NAME, 2, 0), []);
      assert.deepEqual(await poolRegistry.listAssociatedPools(OWNER, INVEST_NAME, 0, 2), []);
    });
  });

  describe("get info from trader pools", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        onlyBABTHolders: false,
        totalLPEmission: 0,
        baseToken: DEXE.address,
        baseTokenDecimals: 8,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
        traderBABTId: 0,
      };

      await deployPool(POOL_PARAMETERS);
      await deployPool(POOL_PARAMETERS);
    });

    it("should get info from trader pools", async () => {
      await truffleAssert.passes(await poolRegistry.listTraderPoolsWithInfo(BASIC_NAME, 0, 10), "passes");
      await truffleAssert.passes(await poolRegistry.listTraderPoolsWithInfo(INVEST_NAME, 0, 10), "passes");

      assert.equal((await poolRegistry.listTraderPoolsWithInfo(BASIC_NAME, 0, 1)).pools.length, 1);
      assert.equal((await poolRegistry.listTraderPoolsWithInfo(INVEST_NAME, 0, 1)).pools.length, 0);
    });
  });
});
