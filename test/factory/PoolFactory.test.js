const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { ComissionPeriods, DEFAULT_CORE_PROPERTIES, ParticipationType } = require("../utils/constants");
const { toPercent } = require("../utils/utils");
const { getCurrentBlockTime } = require("../helpers/block-helper");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const BABTMock = artifacts.require("BABTMock");
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
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
const TraderPoolInvestLib = artifacts.require("TraderPoolInvest");
const TraderPoolDivestLib = artifacts.require("TraderPoolDivest");
const TraderPoolModifyLib = artifacts.require("TraderPoolModify");
const TraderPoolViewLib = artifacts.require("TraderPoolView");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const BasicTraderPool = artifacts.require("BasicTraderPool");
const RiskyPoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");
const InvestPoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
const RiskyPoolProposal = artifacts.require("TraderPoolRiskyProposal");
const InvestPoolProposal = artifacts.require("TraderPoolInvestProposal");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");
const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const PoolFactory = artifacts.require("PoolFactory");
const GovTokenDeployerLib = artifacts.require("GovTokenDeployer");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolStakingLib = artifacts.require("GovPoolStaking");
const GovPoolCreditLib = artifacts.require("GovPoolCredit");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");
const TokenSaleProposalCreateLib = artifacts.require("TokenSaleProposalCreate");
const TokenSaleProposalBuyLib = artifacts.require("TokenSaleProposalBuy");
const TokenSaleProposalVestingLib = artifacts.require("TokenSaleProposalVesting");
const TokenSaleProposalWhitelistLib = artifacts.require("TokenSaleProposalWhitelist");
const TokenSaleProposalClaimLib = artifacts.require("TokenSaleProposalClaim");
const TokenSaleProposalRecoverLib = artifacts.require("TokenSaleProposalRecover");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
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
DistributionProposal.numberFormat = "BigNumber";
TokenSaleProposal.numberFormat = "BigNumber";

describe("PoolFactory", () => {
  let OWNER;
  let SECOND;
  let NOTHING;

  let poolRegistry;
  let poolFactory;
  let coreProperties;

  let testERC20;
  let testERC721;
  let babt;
  let testERC721Multiplier;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    NOTHING = await accounts(3);

    const govTokenDeployerLib = await GovTokenDeployerLib.new();

    await PoolFactory.link(govTokenDeployerLib);

    const govUserKeeperViewLib = await GovUserKeeperViewLib.new();

    const govPoolCreateLib = await GovPoolCreateLib.new();
    const govPoolExecuteLib = await GovPoolExecuteLib.new();
    const govPoolRewardsLib = await GovPoolRewardsLib.new();
    const govPoolUnlockLib = await GovPoolUnlockLib.new();
    const govPoolVoteLib = await GovPoolVoteLib.new();
    const govPoolViewLib = await GovPoolViewLib.new();
    const govPoolStakingLib = await GovPoolStakingLib.new();
    const govPoolCreditLib = await GovPoolCreditLib.new();
    const govPoolOffchainLib = await GovPoolOffchainLib.new();

    await GovUserKeeper.link(govUserKeeperViewLib);

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
    await GovPool.link(govPoolStakingLib);
    await GovPool.link(govPoolCreditLib);
    await GovPool.link(govPoolOffchainLib);

    const tspCreateLib = await TokenSaleProposalCreateLib.new();
    const tspBuyLib = await TokenSaleProposalBuyLib.new();
    const tspVestingLib = await TokenSaleProposalVestingLib.new();
    const tspWhitelistLib = await TokenSaleProposalWhitelistLib.new();
    const tspClaimLib = await TokenSaleProposalClaimLib.new();
    const tspRecoverLib = await TokenSaleProposalRecoverLib.new();

    await TokenSaleProposal.link(tspCreateLib);
    await TokenSaleProposal.link(tspBuyLib);
    await TokenSaleProposal.link(tspVestingLib);
    await TokenSaleProposal.link(tspWhitelistLib);
    await TokenSaleProposal.link(tspClaimLib);
    await TokenSaleProposal.link(tspRecoverLib);

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

    await InvestTraderPool.link(traderPoolCommissionLib);
    await InvestTraderPool.link(traderPoolExchangeLib);
    await InvestTraderPool.link(traderPoolInvestLib);
    await InvestTraderPool.link(traderPoolDivestLib);
    await InvestTraderPool.link(traderPoolModifyLib);
    await InvestTraderPool.link(traderPoolViewLib);

    await BasicTraderPool.link(traderPoolCommissionLib);
    await BasicTraderPool.link(traderPoolExchangeLib);
    await BasicTraderPool.link(traderPoolInvestLib);
    await BasicTraderPool.link(traderPoolDivestLib);
    await BasicTraderPool.link(traderPoolModifyLib);
    await BasicTraderPool.link(traderPoolViewLib);

    const riskyPoolProposalLib = await RiskyPoolProposalLib.new();
    const investPoolProposalLib = await InvestPoolProposalLib.new();

    await RiskyPoolProposal.link(riskyPoolProposalLib);
    await InvestPoolProposal.link(investPoolProposalLib);

    const uniswapV2PathFinderLib = await UniswapV2PathFinderLib.new();

    await PriceFeed.link(uniswapV2PathFinderLib);

    testERC20 = await ERC20Mock.new("TestERC20", "TS", 18);
    testERC721 = await ERC721Mock.new("TestERC721", "TS");
    testERC721Multiplier = await ERC721Multiplier.new("TestERC721Multiplier", "TSM");

    const contractsRegistry = await ContractsRegistry.new();
    const DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 6);
    babt = await BABTMock.new();
    const _dexeExpertNft = await ERC721Expert.new();
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
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babt.address);
    await contractsRegistry.addContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), _dexeExpertNft.address);
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
    let tokenSaleProposal = await TokenSaleProposal.new();

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
      await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
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
      tokenSaleProposal.address,
    ];

    await poolRegistry.setNewImplementations(poolNames, poolAddrs);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("TraderPools", () => {
    describe("deployBasicPool", () => {
      let POOL_PARAMETERS;

      beforeEach("setup", async () => {
        POOL_PARAMETERS = {
          descriptionURL: "placeholder.com",
          trader: OWNER,
          privatePool: false,
          onlyBABTHolders: false,
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
          (await poolRegistry.countPools(await poolRegistry.BASIC_POOL_NAME())).toFixed(),
          lenPools.plus(1).toFixed()
        );
        assert.equal(
          (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.BASIC_POOL_NAME())).toFixed(),
          lenUser.plus(1).toFixed()
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
          onlyBABTHolders: false,
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

        const traderPool = await InvestTraderPool.at(event.args.at);

        assert.equal((await traderPool.getPoolInfo()).parameters.trader, OWNER);
        assert.equal((await traderPool.getPoolInfo()).parameters.baseTokenDecimals, 18);

        assert.equal(
          (await poolRegistry.countPools(await poolRegistry.INVEST_POOL_NAME())).toFixed(),
          lenPools.plus(1).toFixed()
        );
        assert.equal(
          (await poolRegistry.countAssociatedPools(OWNER, await poolRegistry.INVEST_POOL_NAME())).toFixed(),
          lenUser.plus(1).toFixed()
        );
      });

      it("should deploy pool from address with BABT", async () => {
        await babt.attest(OWNER);

        await poolFactory.deployInvestPool("Invest", "IP", POOL_PARAMETERS);

        let traderPool = await InvestTraderPool.at(
          (
            await poolRegistry.listPools(await poolRegistry.INVEST_POOL_NAME(), 0, 1)
          )[0]
        );

        assert.equal((await traderPool.getTraderBABTId()).toFixed(), (await babt.tokenIdOf(OWNER)).toFixed());
      });
    });

    describe("TraderPool validation", () => {
      let POOL_PARAMETERS;

      it("should revert when deploying with incorrect percentage for Period 1", async () => {
        POOL_PARAMETERS = {
          descriptionURL: "placeholder.com",
          trader: OWNER,
          privatePool: false,
          onlyBABTHolders: false,
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

      it("should revert when deploying with incorrect percentage for Period 2", async () => {
        POOL_PARAMETERS = {
          descriptionURL: "placeholder.com",
          trader: OWNER,
          privatePool: false,
          onlyBABTHolders: false,
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

      it("should revert when deploying with incorrect percentage for Period 3", async () => {
        POOL_PARAMETERS = {
          descriptionURL: "placeholder.com",
          trader: OWNER,
          privatePool: false,
          onlyBABTHolders: false,
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
          onlyBABTHolders: false,
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

      it("should revert when deploying pool with trader = address(0)", async () => {
        let POOL_PARAMETERS = {
          descriptionURL: "placeholder.com",
          trader: ZERO_ADDR,
          privatePool: false,
          onlyBABTHolders: false,
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
  });

  describe("GovPools", () => {
    function getGovPoolDefaultDeployParams() {
      return {
        settingsParams: {
          proposalSettings: [
            {
              earlyCompletion: false,
              delegatedVotingAllowed: true,
              validatorsVote: true,
              duration: 700,
              durationValidators: 800,
              quorum: PRECISION.times("71").toFixed(),
              quorumValidators: PRECISION.times("100").toFixed(),
              minVotesForVoting: wei("20"),
              minVotesForCreating: wei("5"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "default",
            },
            {
              earlyCompletion: true,
              delegatedVotingAllowed: true,
              validatorsVote: false,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("5"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "internal",
            },
            {
              earlyCompletion: false,
              delegatedVotingAllowed: true,
              validatorsVote: false,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("5"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "DP",
            },
            {
              earlyCompletion: true,
              delegatedVotingAllowed: false,
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("5"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "validators",
            },
          ],
          additionalProposalExecutors: [],
        },
        validatorsParams: {
          name: "Validator Token",
          symbol: "VT",
          proposalSettings: {
            duration: 500,
            executionDelay: 0,
            quorum: PRECISION.times("51").toFixed(),
          },
          validators: [OWNER],
          balances: [wei("100")],
        },
        userKeeperParams: {
          tokenAddress: testERC20.address,
          nftAddress: testERC721.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        nftMultiplierAddress: testERC721Multiplier.address,
        regularVoteModifier: wei("1", 25),
        expertVoteModifier: wei("1", 25),
        verifier: OWNER,
        onlyBABTHolders: false,
        descriptionURL: "example.com",
        name: "Pool name",
      };
    }

    function getTokenSaleDefaultDeployParams() {
      return {
        tiersParams: [
          {
            metadata: {
              name: "tier1",
              description: "description",
            },
            totalTokenProvided: wei("100"),
            saleStartTime: 0,
            saleEndTime: 1000000,
            claimLockDuration: 0,
            saleTokenAddress: ZERO_ADDR,
            purchaseTokenAddresses: [testERC20.address],
            exchangeRates: [PRECISION.toFixed()],
            minAllocationPerUser: wei("1"),
            maxAllocationPerUser: wei("100"),
            vestingSettings: {
              vestingPercentage: toPercent(50),
              vestingDuration: 86400,
              cliffPeriod: 0,
              unlockStep: 1,
            },
            participationDetails: {
              participationType: ParticipationType.Whitelist,
              data: "0x",
            },
          },
        ],
        whitelistParams: [],
        tokenParams: {
          name: "sale token",
          symbol: "st",
          users: [],
          saleAmount: wei("100"),
          cap: wei("1000"),
          mintedTotal: wei("150"),
          amounts: [],
        },
      };
    }

    function getGovPoolSaleConfiguredParams() {
      let POOL_PARAMETERS = getGovPoolDefaultDeployParams();

      POOL_PARAMETERS.settingsParams.proposalSettings.push({
        earlyCompletion: false,
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 500,
        durationValidators: 600,
        quorum: PRECISION.times("51").toFixed(),
        quorumValidators: PRECISION.times("61").toFixed(),
        minVotesForVoting: wei("10"),
        minVotesForCreating: wei("5"),
        executionDelay: 0,
        rewardsInfo: {
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
        },
        executorDescription: "Token Sale",
      });

      POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(ZERO_ADDR);

      return POOL_PARAMETERS;
    }

    describe("deployGovPool", () => {
      it("should deploy pool with DP", async () => {
        let POOL_PARAMETERS = getGovPoolDefaultDeployParams();

        const predictedGovAddress = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];

        let tx = await poolFactory.deployGovPool(POOL_PARAMETERS);
        let event = tx.receipt.logs[0];

        assert.isTrue(await poolRegistry.isGovPool(event.args.govPool));
        assert.equal((await poolRegistry.countPools(await poolRegistry.GOV_POOL_NAME())).toFixed(), "1");

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(govPool.address, predictedGovAddress);

        let helperContracts = await govPool.getHelperContracts();

        let govSettings = await GovSettings.at(helperContracts[0]);
        let govValidators = await GovValidators.at(helperContracts[2]);
        let settings = await govSettings.getExecutorSettings(helperContracts[3]);

        assert.equal(await govPool.descriptionURL(), "example.com");

        assert.equal((await govValidators.validatorsCount()).toFixed(), 1);

        assert.equal(settings[0], POOL_PARAMETERS.settingsParams.proposalSettings[2].earlyCompletion);

        assert.equal((await govPool.getNftContracts()).nftMultiplier, testERC721Multiplier.address);
      });

      it("should deploy pool with Expert Nft", async () => {
        let POOL_PARAMETERS = getGovPoolDefaultDeployParams();
        const predictedGovAddress = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at(predictedGovAddress);

        let dexeNftAddress = (await govPool.getNftContracts()).dexeExpertNft;
        let nftAddress = (await govPool.getNftContracts()).expertNft;

        assert.isTrue(nftAddress != ZERO_ADDR);
        assert.isTrue(dexeNftAddress != ZERO_ADDR);

        let expertNft = await ERC721Expert.at(nftAddress);

        assert.equal(await expertNft.owner(), predictedGovAddress);
        assert.equal(await expertNft.name(), POOL_PARAMETERS.name + " Expert Nft");
        assert.equal(await expertNft.symbol(), POOL_PARAMETERS.name + " EXPNFT");
      });

      it("should deploy pool with voting parameters", async () => {
        let POOL_PARAMETERS = getGovPoolDefaultDeployParams();
        const predictedGovAddress = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at(predictedGovAddress);

        let votingParameters = await govPool.getVoteModifiers();
        assert.equal(votingParameters[0].toFixed(), POOL_PARAMETERS.regularVoteModifier);
        assert.equal(votingParameters[1].toFixed(), POOL_PARAMETERS.expertVoteModifier);
      });

      it("should deploy pool from address with BABT", async () => {
        await babt.attest(OWNER);

        let POOL_PARAMETERS = getGovPoolDefaultDeployParams();

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal((await govPool.deployerBABTid()).toFixed(), (await babt.tokenIdOf(OWNER)).toFixed());
      });
    });

    describe("deployGovPoolWithTokenSale", () => {
      it("should deploy pool and instantiate token sale", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();
        let SALE_PARAMETERS = getTokenSaleDefaultDeployParams();

        SALE_PARAMETERS.tiersParams.push({
          metadata: {
            name: "tier2",
            description: "description",
          },
          totalTokenProvided: wei("100"),
          saleStartTime: await getCurrentBlockTime(),
          saleEndTime: (await getCurrentBlockTime()) + 10000,
          claimLockDuration: 0,
          saleTokenAddress: testERC20.address,
          purchaseTokenAddresses: [testERC20.address],
          exchangeRates: [PRECISION.toFixed()],
          minAllocationPerUser: wei("1"),
          maxAllocationPerUser: wei("100"),
          vestingSettings: {
            vestingPercentage: toPercent(50),
            vestingDuration: 86400,
            cliffPeriod: 0,
            unlockStep: 1,
          },
          participationDetails: {
            participationType: ParticipationType.BABT,
            data: "0x",
          },
        });

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        SALE_PARAMETERS.tiersParams[0].saleTokenAddress = predictedGovAddresses[2];
        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses[2];
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses[1];

        let tx = await poolFactory.deployGovPoolWithTokenSale(POOL_PARAMETERS, SALE_PARAMETERS);
        let event = tx.receipt.logs[1];

        let tokenSale = await TokenSaleProposal.at(event.args.tokenSale);
        let token = await ERC20Mock.at(event.args.token);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(govPool.address, predictedGovAddresses[0]);
        assert.equal(tokenSale.address, predictedGovAddresses[1]);
        assert.equal(token.address, predictedGovAddresses[2]);

        let helperContracts = await govPool.getHelperContracts();

        let govUserKeeper = await GovUserKeeper.at(helperContracts[1]);

        assert.equal(await token.totalSupply(), wei("150"));
        assert.equal(await token.balanceOf(govPool.address), wei("50"));
        assert.equal(await token.balanceOf(tokenSale.address), wei("100"));

        assert.equal(await tokenSale.latestTierId(), "2");

        assert.equal(await govUserKeeper.tokenAddress(), token.address);
      });

      it("should deploy pool with empty token sale", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();
        let SALE_PARAMETERS = getTokenSaleDefaultDeployParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        SALE_PARAMETERS.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses[1];

        let tx = await poolFactory.deployGovPoolWithTokenSale(POOL_PARAMETERS, SALE_PARAMETERS);
        let event = tx.receipt.logs[1];

        let tokenSale = await TokenSaleProposal.at(event.args.tokenSale);
        let token = await ERC20Mock.at(event.args.token);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        let govUserKeeper = await GovUserKeeper.at(helperContracts[1]);

        assert.equal(await tokenSale.latestTierId(), "0");

        assert.equal(await govUserKeeper.tokenAddress(), token.address);
        assert.equal(await govUserKeeper.tokenAddress(), testERC20.address);
      });
    });

    describe("deploy2 validation", () => {
      it("should deploy pools with the same name from different deployers", async () => {
        let POOL_PARAMETERS = getGovPoolDefaultDeployParams();

        const predictedAddressOwner = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];
        const predictedAddressSecond = (await poolFactory.predictGovAddresses(SECOND, POOL_PARAMETERS.name))[0];

        assert.notEqual(predictedAddressOwner, ZERO_ADDR);
        assert.notEqual(predictedAddressSecond, ZERO_ADDR);
        assert.notEqual(predictedAddressOwner, predictedAddressSecond);

        await poolFactory.deployGovPool(POOL_PARAMETERS);
        await poolFactory.deployGovPool(POOL_PARAMETERS, { from: SECOND });

        assert.deepEqual(await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 2), [
          predictedAddressOwner,
          predictedAddressSecond,
        ]);
      });

      it("should not deploy pools with the same salt", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();
        let SALE_PARAMETERS = getTokenSaleDefaultDeployParams();

        SALE_PARAMETERS.tiersParams.pop();

        await poolFactory.deployGovPoolWithTokenSale(POOL_PARAMETERS, SALE_PARAMETERS);

        await truffleAssert.reverts(
          poolFactory.deployGovPoolWithTokenSale(POOL_PARAMETERS, SALE_PARAMETERS),
          "PoolFactory: pool name is already taken"
        );

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name is already taken"
        );
      });

      it("should revert if name is an empty string", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();
        let SALE_PARAMETERS = getTokenSaleDefaultDeployParams();

        SALE_PARAMETERS.tiersParams.pop();
        POOL_PARAMETERS.name = "";

        await truffleAssert.reverts(
          poolFactory.deployGovPoolWithTokenSale(POOL_PARAMETERS, SALE_PARAMETERS),
          "PoolFactory: pool name cannot be empty"
        );

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name cannot be empty"
        );
      });
    });

    describe("predictGovAddress", () => {
      it("should return zero address if name is an empty string", async () => {
        assert.deepEqual(Object.values(await poolFactory.predictGovAddresses(OWNER, "")), [
          ZERO_ADDR,
          ZERO_ADDR,
          ZERO_ADDR,
        ]);
      });
    });
  });
});
