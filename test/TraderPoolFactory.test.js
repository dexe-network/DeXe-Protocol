const { assert } = require("chai");
const { toBN, accounts } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const BasicTraderPool = artifacts.require("BasicTraderPool");
const RiskyPoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");
const InvestPoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
const RiskyPoolProposal = artifacts.require("TraderPoolRiskyProposal");
const InvestPoolProposal = artifacts.require("TraderPoolInvestProposal");
const TraderPoolFactory = artifacts.require("TraderPoolFactory");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
BasicTraderPool.numberFormat = "BigNumber";
RiskyPoolProposal.numberFormat = "BigNumber";
InvestPoolProposal.numberFormat = "BigNumber";
TraderPoolFactory.numberFormat = "BigNumber";

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

describe("TraderPoolFactory", () => {
  let OWNER;
  let THIRD;
  let NOTHING;

  let DEXE;
  let traderPoolRegistry;
  let traderPoolFactory;

  let testCoin;

  before("setup", async () => {
    OWNER = await accounts(0);
    THIRD = await accounts(2);
    NOTHING = await accounts(3);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolCommissionLib.link(traderPoolPriceLib);
    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();

    await InvestTraderPool.link(traderPoolCommissionLib);
    await InvestTraderPool.link(traderPoolLeverageLib);
    await InvestTraderPool.link(traderPoolPriceLib);
    await InvestTraderPool.link(traderPoolViewLib);

    await BasicTraderPool.link(traderPoolCommissionLib);
    await BasicTraderPool.link(traderPoolLeverageLib);
    await BasicTraderPool.link(traderPoolPriceLib);
    await BasicTraderPool.link(traderPoolViewLib);

    const riskyPoolProposalLib = await RiskyPoolProposalLib.new();
    const investPoolProposalLib = await InvestPoolProposalLib.new();

    await RiskyPoolProposal.link(riskyPoolProposalLib);
    await InvestPoolProposal.link(investPoolProposalLib);
  });

  beforeEach("setup", async () => {
    testCoin = await ERC20Mock.new("TestCoin", "TS", 18);

    const contractsRegistry = await ContractsRegistry.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const _coreProperties = await CoreProperties.new(DEFAULT_CORE_PROPERTIES);
    const _priceFeed = await PriceFeed.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _traderPoolFactory = await TraderPoolFactory.new();

    await contractsRegistry.__ContractsRegistry_init();

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
    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());
    traderPoolFactory = await TraderPoolFactory.at(await contractsRegistry.getTraderPoolFactoryContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();
    await traderPoolRegistry.__TraderPoolRegistry_init();
    await traderPoolFactory.__TraderPoolFactory_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_FACTORY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    let investTraderPool = await InvestTraderPool.new();
    let basicTraderPool = await BasicTraderPool.new();
    let riskyPoolProposal = await RiskyPoolProposal.new();
    let investPoolProposal = await InvestPoolProposal.new();

    const poolNames = [
      await traderPoolRegistry.INVEST_POOL_NAME(),
      await traderPoolRegistry.BASIC_POOL_NAME(),
      await traderPoolRegistry.RISKY_PROPOSAL_NAME(),
      await traderPoolRegistry.INVEST_PROPOSAL_NAME(),
    ];

    const poolAddrs = [
      investTraderPool.address,
      basicTraderPool.address,
      riskyPoolProposal.address,
      investPoolProposal.address,
    ];

    await traderPoolRegistry.setNewImplementations(poolNames, poolAddrs);
    await priceFeed.addSupportedBaseTokens([testCoin.address]);
  });

  describe("deployBasicPool", async () => {
    let POOL_PARAMETERS;

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
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
    });

    it("should deploy basic pool and check event", async () => {
      let tx = await traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.equal("Deployed", event.event);
      assert.equal(OWNER, event.args.user);
      assert.equal("BASIC_POOL", event.args.poolName);
    });

    it("should deploy pool and check TraderPoolRegistry", async () => {
      let lenPools = await traderPoolRegistry.countPools(await traderPoolRegistry.BASIC_POOL_NAME());
      let lenUser = await traderPoolRegistry.countUserPools(OWNER, await traderPoolRegistry.BASIC_POOL_NAME());

      let tx = await traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await traderPoolRegistry.isPool(event.args.at));

      assert.equal(
        (await traderPoolRegistry.countPools(await traderPoolRegistry.BASIC_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await traderPoolRegistry.countUserPools(OWNER, await traderPoolRegistry.BASIC_POOL_NAME())).toString(),
        lenUser.plus(1).toString()
      );
    });
  });

  describe("deployInvestPool", async () => {
    let POOL_PARAMETERS = {};

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };
    });

    it("should deploy invest pool and check events", async () => {
      let tx = await traderPoolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.equal("Deployed", event.event);
      assert.equal(OWNER, event.args.user);
      assert.equal("INVEST_POOL", event.args.poolName);
    });

    it("should deploy pool and check TraderPoolRegistry", async () => {
      let lenPools = await traderPoolRegistry.countPools(await traderPoolRegistry.INVEST_POOL_NAME());
      let lenUser = await traderPoolRegistry.countUserPools(OWNER, await traderPoolRegistry.INVEST_POOL_NAME());

      let tx = await traderPoolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await traderPoolRegistry.isPool(event.args.at));

      assert.equal(
        (await traderPoolRegistry.countPools(await traderPoolRegistry.INVEST_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await traderPoolRegistry.countUserPools(OWNER, await traderPoolRegistry.INVEST_POOL_NAME())).toString(),
        lenUser.plus(1).toString()
      );
    });
  });

  describe("validating", async () => {
    let POOL_PARAMETERS = {};

    it("should revert when try to deploy with incorrect percentage for Period1", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "TraderPoolFactory: Incorrect percentage."
      );
    });

    it("should revert when try to deploy with incorrect percentage for Period2", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_2,
        commissionPercentage: toBN(70).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "TraderPoolFactory: Incorrect percentage."
      );
    });

    it("should revert when try to deploy with incorrect percentage for Period3", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_3,
        commissionPercentage: toBN(100).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "TraderPoolFactory: Incorrect percentage."
      );
    });

    it("should revert when try to deploy with not base token", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: THIRD,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_3,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        traderPoolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "TraderPoolFactory: Unsupported token."
      );
    });
  });
});
