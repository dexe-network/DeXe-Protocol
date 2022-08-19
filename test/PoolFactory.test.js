const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const PoolRegistry = artifacts.require("PoolRegistry");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const BasicTraderPool = artifacts.require("BasicTraderPool");
const RiskyPoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");
const InvestPoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
const RiskyPoolProposal = artifacts.require("TraderPoolRiskyProposal");
const InvestPoolProposal = artifacts.require("TraderPoolInvestProposal");
const DistributionProposal = artifacts.require("DistributionProposal");
const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const PoolFactory = artifacts.require("PoolFactory");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
BasicTraderPool.numberFormat = "BigNumber";
RiskyPoolProposal.numberFormat = "BigNumber";
InvestPoolProposal.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
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
  minInsuranceProposalAmount: DECIMAL.times(100).toFixed(),
  insuranceWithdrawalLock: SECONDS_IN_DAY,
};

describe("PoolFactory", () => {
  let OWNER;
  let NOTHING;

  let poolRegistry;
  let poolFactory;
  let coreProperties;

  let testERC20;
  let testERC721;

  before("setup", async () => {
    OWNER = await accounts(0);
    NOTHING = await accounts(3);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();
    const traderPoolExchangeLib = await TraderPoolExchangeLib.new();

    await InvestTraderPool.link(traderPoolCommissionLib);
    await InvestTraderPool.link(traderPoolLeverageLib);
    await InvestTraderPool.link(traderPoolPriceLib);
    await InvestTraderPool.link(traderPoolExchangeLib);
    await InvestTraderPool.link(traderPoolViewLib);

    await BasicTraderPool.link(traderPoolCommissionLib);
    await BasicTraderPool.link(traderPoolLeverageLib);
    await BasicTraderPool.link(traderPoolPriceLib);
    await BasicTraderPool.link(traderPoolExchangeLib);
    await BasicTraderPool.link(traderPoolViewLib);

    const riskyPoolProposalLib = await RiskyPoolProposalLib.new();
    const investPoolProposalLib = await InvestPoolProposalLib.new();

    await RiskyPoolProposal.link(riskyPoolProposalLib);
    await InvestPoolProposal.link(investPoolProposalLib);

    const uniswapV2PathFinderLib = await UniswapV2PathFinderLib.new();

    await PriceFeed.link(uniswapV2PathFinderLib);
  });

  beforeEach("setup", async () => {
    testERC20 = await ERC20Mock.new("TestERC20", "TS", 18);
    testERC721 = await ERC721Mock.new("TestERC721", "TS");

    const contractsRegistry = await ContractsRegistry.new();
    const DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 6);
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeed.new();
    const _poolRegistry = await PoolRegistry.new();
    const _poolFactory = await PoolFactory.new();
    const uniswapV2Router = await UniswapV2RouterMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), _poolFactory.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), uniswapV2Router.address);

    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());
    poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();
    await poolRegistry.__OwnablePoolContractsRegistry_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());

    let investTraderPool = await InvestTraderPool.new();
    let basicTraderPool = await BasicTraderPool.new();
    let riskyPoolProposal = await RiskyPoolProposal.new();
    let investPoolProposal = await InvestPoolProposal.new();
    let distributionProposal = await DistributionProposal.new();

    let govPool = await GovPool.new();
    let govUserKeeper = await GovUserKeeper.new();
    let govSettings = await GovSettings.new();
    let govValidators = await GovValidators.new();

    const poolNames = [
      await poolRegistry.INVEST_POOL_NAME(),
      await poolRegistry.BASIC_POOL_NAME(),
      await poolRegistry.RISKY_PROPOSAL_NAME(),
      await poolRegistry.INVEST_PROPOSAL_NAME(),
      await poolRegistry.GOV_POOL_NAME(),
      await poolRegistry.USER_KEEPER_NAME(),
      await poolRegistry.SETTINGS_NAME(),
      await poolRegistry.VALIDATORS_NAME(),
      await poolRegistry.DISTRIBUTION_PROPOSAL_NAME(),
    ];

    const poolAddrs = [
      investTraderPool.address,
      basicTraderPool.address,
      riskyPoolProposal.address,
      investPoolProposal.address,
      govPool.address,
      govUserKeeper.address,
      govSettings.address,
      govValidators.address,
      distributionProposal.address,
    ];

    await poolRegistry.setNewImplementations(poolNames, poolAddrs);
  });

  describe("deployBasicPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testERC20.address,
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

    it("should deploy pool and check PoolRegistry", async () => {
      let lenPools = await poolRegistry.countPools(await poolRegistry.BASIC_POOL_NAME());
      let lenUser = await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.BASIC_POOL_NAME());

      let tx = await poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await poolRegistry.isTraderPool(event.args.at));

      const traderPool = await BasicTraderPool.at(event.args.at);

      assert.equal((await traderPool.getPoolInfo()).parameters.trader, OWNER);
      assert.equal((await traderPool.getPoolInfo()).parameters.baseTokenDecimals, 18);

      assert.equal(
        (await poolRegistry.countPools(await poolRegistry.BASIC_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.BASIC_POOL_NAME())).toString(),
        lenUser.plus(1).toString()
      );
    });
  });

  describe("deployInvestPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testERC20.address,
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

    it("should deploy pool and check PoolRegistry", async () => {
      let lenPools = await poolRegistry.countPools(await poolRegistry.INVEST_POOL_NAME());
      let lenUser = await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.INVEST_POOL_NAME());

      let tx = await poolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);
      let event = tx.receipt.logs[0];

      assert.isTrue(await poolRegistry.isTraderPool(event.args.at));

      const traderPool = await BasicTraderPool.at(event.args.at);

      assert.equal((await traderPool.getPoolInfo()).parameters.trader, OWNER);
      assert.equal((await traderPool.getPoolInfo()).parameters.baseTokenDecimals, 18);

      assert.equal(
        (await poolRegistry.countPools(await poolRegistry.INVEST_POOL_NAME())).toString(),
        lenPools.plus(1).toString()
      );
      assert.equal(
        (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.INVEST_POOL_NAME())).toString(),
        lenUser.plus(1).toString()
      );
    });
  });

  describe("TraderPool validation", async () => {
    let POOL_PARAMETERS;

    it("should revert when try to deploy with incorrect percentage for Period 1", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testERC20.address,
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
        baseToken: testERC20.address,
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
        baseToken: testERC20.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_3,
        commissionPercentage: toBN(100).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: Incorrect percentage"
      );
    });

    it("should not deploy pool with blacklisted base token", async () => {
      let POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testERC20.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };

      await coreProperties.addBlacklistTokens([testERC20.address]);

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: token is blacklisted"
      );
    });

    it("should revert when try to deploy pool with trader = address(0)", async () => {
      let POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: "0x0000000000000000000000000000000000000000",
        privatePool: false,
        totalLPEmission: 0,
        baseToken: testERC20.address,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };

      await truffleAssert.reverts(
        poolFactory.deployBasicPool("Basic", "BP", POOL_PARAMETERS),
        "PoolFactory: invalid trader address"
      );
    });
  });

  describe("deployGovPool", () => {
    let POOL_PARAMETERS;

    it("should deploy gov pool with validators", async () => {
      POOL_PARAMETERS = {
        seetingsParams: {
          internalProposalSetting: {
            earlyCompletion: true,
            delegatedVotingAllowed: true,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          distributionProposalSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          validatorsBalancesSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          defaultProposalSetting: {
            earlyCompletion: false,
            delegatedVotingAllowed: true,
            validatorsVote: false,
            duration: 700,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minTokenBalance: wei("20"),
            minNftBalance: 3,
          },
        },
        validatorsParams: {
          name: "Validator Token",
          symbol: "VT",
          duration: 500,
          quorum: PRECISION.times("51").toFixed(),
          validators: [OWNER],
          balances: [wei("100")],
        },
        userKeeperParams: {
          tokenAddress: testERC20.address,
          nftAddress: testERC721.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        owner: OWNER,
        votesLimit: 10,
        feePercentage: PRECISION.toFixed(),
        descriptionURL: "example.com",
      };

      await poolFactory.deployGovPool(false, POOL_PARAMETERS);

      assert.equal((await poolRegistry.countPools(await poolRegistry.GOV_POOL_NAME())).toString(), "1");
      assert.equal(
        (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.GOV_POOL_NAME())).toString(),
        "1"
      );

      let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
      assert.equal(await govPool.owner(), OWNER);

      let govValidators = await GovValidators.at(await govPool.govValidators());

      assert.equal((await govValidators.validatorsCount()).toFixed(), 1);
    });

    it("should deploy gov pool without validators", async () => {
      POOL_PARAMETERS = {
        seetingsParams: {
          internalProposalSetting: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          distributionProposalSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          validatorsBalancesSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          defaultProposalSetting: {
            earlyCompletion: false,
            delegatedVotingAllowed: true,
            validatorsVote: false,
            duration: 700,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minTokenBalance: wei("20"),
            minNftBalance: 3,
          },
        },
        validatorsParams: {
          name: "Validator Token",
          symbol: "VT",
          duration: 500,
          quorum: PRECISION.times("51").toFixed(),
          validators: [],
          balances: [],
        },
        userKeeperParams: {
          tokenAddress: testERC20.address,
          nftAddress: testERC721.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        owner: OWNER,
        votesLimit: 10,
        feePercentage: PRECISION.toFixed(),
        descriptionURL: "example.com",
      };

      await poolFactory.deployGovPool(false, POOL_PARAMETERS);

      assert.equal((await poolRegistry.countPools(await poolRegistry.GOV_POOL_NAME())).toString(), "1");
      assert.equal(
        (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.GOV_POOL_NAME())).toString(),
        "1"
      );
    });

    it("should deploy pool with DP", async () => {
      POOL_PARAMETERS = {
        seetingsParams: {
          internalProposalSetting: {
            earlyCompletion: true,
            delegatedVotingAllowed: true,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          distributionProposalSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          validatorsBalancesSettings: {
            earlyCompletion: true,
            delegatedVotingAllowed: false,
            validatorsVote: true,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minTokenBalance: wei("10"),
            minNftBalance: 2,
          },
          defaultProposalSetting: {
            earlyCompletion: false,
            delegatedVotingAllowed: true,
            duration: 700,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minTokenBalance: wei("20"),
            minNftBalance: 3,
          },
        },
        validatorsParams: {
          name: "Validator Token",
          symbol: "VT",
          duration: 500,
          quorum: PRECISION.times("51").toFixed(),
          validators: [OWNER],
          balances: [wei("100")],
        },
        userKeeperParams: {
          tokenAddress: testERC20.address,
          nftAddress: testERC721.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        owner: OWNER,
        votesLimit: 10,
        feePercentage: PRECISION.toFixed(),
        descriptionURL: "example.com",
      };

      await poolFactory.deployGovPool(true, POOL_PARAMETERS);

      assert.equal((await poolRegistry.countPools(await poolRegistry.GOV_POOL_NAME())).toString(), "1");
      assert.equal(
        (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.GOV_POOL_NAME())).toString(),
        "1"
      );

      let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
      assert.equal(await govPool.owner(), OWNER);
      assert.notEqual(await govPool.distributionProposal(), "0x0000000000000000000000000000000000000000");

      let govSettings = await GovSettings.at(await govPool.govSetting());
      let settings = await govSettings.getSettings(await govPool.distributionProposal());

      assert.equal(settings[0], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.earlyCompletion);
      assert.equal(settings[1], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.delegatedVotingAllowed);
      assert.equal(settings[2], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.validatorsVote);
      assert.equal(settings[3], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.duration);
      assert.equal(settings[4], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.durationValidators);
      assert.equal(settings[5], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.quorum);
      assert.equal(settings[6], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.quorumValidators);
      assert.equal(settings[7], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.minTokenBalance);
      assert.equal(settings[8], POOL_PARAMETERS.seetingsParams.distributionProposalSettings.minNftBalance);
    });
  });
});
