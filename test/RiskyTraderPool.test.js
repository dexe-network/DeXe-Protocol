const { toBN, accounts, wei } = require("./helpers/utils");
const { setNextBlockTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");
const { artifacts } = require("hardhat");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const RiskyTraderPool = artifacts.require("RiskyTraderPool");
const BasicTraderPool = artifacts.require("BasicTraderPool");
const TraderPoolFactory = artifacts.require("TraderPoolFactory");
const TraderPoolHelperLib = artifacts.require("TraderPoolHelper");
const Insurance = artifacts.require("Insurance");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
RiskyTraderPool.numberFormat = "BigNumber";
BasicTraderPool.numberFormat = "BigNumber";
TraderPoolFactory.numberFormat = "BigNumber";
TraderPoolHelperLib.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";

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

describe("RiskyTraderPool", async () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let NOTHING;

  let DEXE;
  let traderPoolRegistry;
  let traderPoolFactory;

  let testCoin;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    NOTHING = await accounts(3);

    const traderPoolHelper = await TraderPoolHelperLib.new();

    await InvestTraderPool.link(traderPoolHelper);
    await RiskyTraderPool.link(traderPoolHelper);
    await BasicTraderPool.link(traderPoolHelper);
  });

  beforeEach("setup", async () => {
    testCoin = await ERC20Mock.new("TestCoin", "TS", 18);

    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);

    const _coreProperties = await CoreProperties.new(DEFAULT_CORE_PROPERTIES);
    const _priceFeed = await PriceFeed.new();

    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _traderPoolFactory = await TraderPoolFactory.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
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

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    let coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());
    traderPoolFactory = await TraderPoolFactory.at(await contractsRegistry.getTraderPoolFactoryContract());

    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_FACTORY_NAME());

    await traderPoolRegistry.__TraderPoolRegistry_init();
    await traderPoolFactory.__TraderPoolFactory_init();

    let _investTraderPool = await InvestTraderPool.new();
    let _basicTraderPool = await BasicTraderPool.new();
    let _riskyTraderPool = await RiskyTraderPool.new();

    const poolNames = [
      await traderPoolRegistry.INVEST_POOL_NAME(),
      await traderPoolRegistry.RISKY_POOL_NAME(),
      await traderPoolRegistry.BASIC_POOL_NAME(),
    ];
    const poolAddrs = [_investTraderPool.address, _riskyTraderPool.address, _basicTraderPool.address];
    await traderPoolRegistry.setNewImplementations(poolNames, poolAddrs);

    let priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
    await priceFeed.__PriceFeed_init();
    await priceFeed.addSupportedBaseTokens([testCoin.address]);
  });

  describe("invest", async () => {
    let POOL_PARAMETERS;
    let risky;

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        description: "placeholder",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };
      let tx = await traderPoolFactory.deployRiskyPool("Risky", "RP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];
      risky = await RiskyTraderPool.at(event.args.at);
    });

    it("should revert when try to invest from not owner address", async () => {
      await truffleAssert.reverts(
        risky.invest(100, { from: SECOND }),
        "RiskyTraderPool: wait a few days after first invest"
      );
    });

    it("should revert when try to invest before exchange", async () => {
      await testCoin.mint(SECOND, 100);
      await testCoin.approve(risky.address, 100, { from: SECOND });
      await truffleAssert.reverts(
        risky.invest(100, { from: SECOND }),
        "RiskyTraderPool: wait a few days after first invest"
      );
    });

    it("should revert when try to invest wait delay", async () => {
      await testCoin.mint(OWNER, 100);
      await testCoin.approve(risky.address, 100);
      await risky.invest(100, { from: OWNER });
      await testCoin.mint(SECOND, 100);
      await testCoin.approve(risky.address, 100);
      let token = await ERC20Mock.new("test", "TS", 100);

      await risky.exchange(testCoin.address, token.address, 100);
      await truffleAssert.reverts(
        risky.invest(100, { from: SECOND }),
        "RiskyTraderPool: wait a few days after first invest"
      );
    });

    it("should invest after delay", async () => {
      await testCoin.mint(OWNER, 100);
      await testCoin.approve(risky.address, 100);
      await risky.invest(100, { from: OWNER });
      await testCoin.mint(SECOND, 100);
      await testCoin.approve(risky.address, 100);
      let token = await ERC20Mock.new("test", "TS", 100);

      await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

      await risky.exchange(testCoin.address, token.address, 100);
      await truffleAssert.reverts(
        risky.invest(100, { from: SECOND }),
        "RiskyTraderPool: wait a few days after first invest"
      );
    });
  });
});
