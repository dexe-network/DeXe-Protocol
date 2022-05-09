const { assert } = require("chai");
const { toBN, accounts } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const GovPoolRegistry = artifacts.require("GovPoolRegistry");
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
const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");
const PoolFactory = artifacts.require("PoolFactory");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
GovPoolRegistry.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
BasicTraderPool.numberFormat = "BigNumber";
RiskyPoolProposal.numberFormat = "BigNumber";
InvestPoolProposal.numberFormat = "BigNumber";
PoolFactory.numberFormat = "BigNumber";

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
};

describe("PoolFactory", () => {
  let OWNER;
  let THIRD;
  let NOTHING;

  let DEXE;
  let traderPoolRegistry;
  let govPoolRegistry;
  let poolFactory;

  let testCoin;

  before("setup", async () => {
    OWNER = await accounts(0);
    THIRD = await accounts(2);
    NOTHING = await accounts(3);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

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

    const uniswapV2PathFinderLib = await UniswapV2PathFinderLib.new();

    await PriceFeed.link(uniswapV2PathFinderLib);
  });

  beforeEach("setup", async () => {
    testCoin = await ERC20Mock.new("TestCoin", "TS", 18);

    const contractsRegistry = await ContractsRegistry.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const _coreProperties = await CoreProperties.new(DEFAULT_CORE_PROPERTIES);
    const _priceFeed = await PriceFeed.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _govPoolRegistry = await GovPoolRegistry.new();
    const _poolFactory = await PoolFactory.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );
    await contractsRegistry.addProxyContract(
      await contractsRegistry.GOV_POOL_REGISTRY_NAME(),
      _govPoolRegistry.address
    );
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), _poolFactory.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());
    govPoolRegistry = await GovPoolRegistry.at(await contractsRegistry.getGovPoolRegistryContract());
    poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();
    await traderPoolRegistry.__PoolContractsRegistry_init();
    await govPoolRegistry.__PoolContractsRegistry_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.GOV_POOL_REGISTRY_NAME());
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
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };
    });

    it("should deploy basic pool and check event", async () => {
      let tx = await poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.equal("TraderPoolDeployed", event.event);
      assert.equal(OWNER, event.args.trader);
      assert.equal("BASIC_POOL", event.args.poolType);
    });

    it("should deploy pool and check TraderPoolRegistry", async () => {
      let lenPools = await traderPoolRegistry.countPools(await traderPoolRegistry.BASIC_POOL_NAME());
      let lenUser = await traderPoolRegistry.countTraderPools(OWNER, await traderPoolRegistry.BASIC_POOL_NAME());

      let tx = await poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await traderPoolRegistry.isPool(event.args.at));

      assert.equal(
        (await traderPoolRegistry.countPools(await traderPoolRegistry.BASIC_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await traderPoolRegistry.countTraderPools(OWNER, await traderPoolRegistry.BASIC_POOL_NAME())).toString(),
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
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };
    });

    it("should deploy invest pool and check events", async () => {
      let tx = await poolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.equal("TraderPoolDeployed", event.event);
      assert.equal(OWNER, event.args.trader);
      assert.equal("INVEST_POOL", event.args.poolType);
    });

    it("should deploy pool and check TraderPoolRegistry", async () => {
      let lenPools = await traderPoolRegistry.countPools(await traderPoolRegistry.INVEST_POOL_NAME());
      let lenUser = await traderPoolRegistry.countTraderPools(OWNER, await traderPoolRegistry.INVEST_POOL_NAME());

      let tx = await poolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await traderPoolRegistry.isPool(event.args.at));

      assert.equal(
        (await traderPoolRegistry.countPools(await traderPoolRegistry.INVEST_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await traderPoolRegistry.countTraderPools(OWNER, await traderPoolRegistry.INVEST_POOL_NAME())).toString(),
        lenUser.plus(1).toString()
      );
    });
  });

  describe("TraderPool validation", async () => {
    let POOL_PARAMETERS = {};

    it("should revert when try to deploy with incorrect percentage for Period 1", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: Incorrect percentage"
      );
    });

    it("should revert when try to deploy with incorrect percentage for Period 2", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_2,
        commissionPercentage: toBN(70).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: Incorrect percentage"
      );
    });

    it("should revert when try to deploy with incorrect percentage for Period 3", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testCoin.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_3,
        commissionPercentage: toBN(100).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: Incorrect percentage"
      );
    });

    it("should revert when try to deploy with not base token", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: THIRD,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_3,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: Unsupported token"
      );
    });
  });
});
