const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getBytesLinearPowerInit, getBytesPolynomialPowerInit } = require("../utils/gov-vote-power-utils");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { DEFAULT_CORE_PROPERTIES, ParticipationType, VotePowerType } = require("../utils/constants");
const { toPercent } = require("../utils/utils");
const { getCurrentBlockTime } = require("../helpers/block-helper");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const BABTMock = artifacts.require("BABTMock");
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const LinearPower = artifacts.require("LinearPower");
const PolynomialPower = artifacts.require("PolynomialPower");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const PoolRegistry = artifacts.require("PoolRegistry");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");
const UniswapPathFinderLib = artifacts.require("UniswapPathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const UniswapV3QuoterMock = artifacts.require("UniswapV3QuoterMock");
const PoolFactory = artifacts.require("PoolFactory");
const GovTokenDeployerLib = artifacts.require("GovTokenDeployer");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolMicropoolLib = artifacts.require("GovPoolMicropool");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolCreditLib = artifacts.require("GovPoolCredit");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");
const TokenSaleProposalCreateLib = artifacts.require("TokenSaleProposalCreate");
const TokenSaleProposalBuyLib = artifacts.require("TokenSaleProposalBuy");
const TokenSaleProposalVestingLib = artifacts.require("TokenSaleProposalVesting");
const TokenSaleProposalWhitelistLib = artifacts.require("TokenSaleProposalWhitelist");
const TokenSaleProposalClaimLib = artifacts.require("TokenSaleProposalClaim");
const TokenSaleProposalRecoverLib = artifacts.require("TokenSaleProposalRecover");
const GovValidatorsCreateLib = artifacts.require("GovValidatorsCreate");
const GovValidatorsVoteLib = artifacts.require("GovValidatorsVote");
const GovValidatorsExecuteLib = artifacts.require("GovValidatorsExecute");

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
UniswapV2RouterMock.numberFormat = "BigNumber";
UniswapV3QuoterMock.numberFormat = "BigNumber";
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
    const govPoolMicropoolLib = await GovPoolMicropoolLib.new();
    const govPoolRewardsLib = await GovPoolRewardsLib.new();
    const govPoolUnlockLib = await GovPoolUnlockLib.new();
    const govPoolVoteLib = await GovPoolVoteLib.new();
    const govPoolViewLib = await GovPoolViewLib.new();
    const govPoolCreditLib = await GovPoolCreditLib.new();
    const govPoolOffchainLib = await GovPoolOffchainLib.new();

    await GovUserKeeper.link(govUserKeeperViewLib);

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolMicropoolLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
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

    const govValidatorsCreateLib = await GovValidatorsCreateLib.new();
    const govValidatorsVoteLib = await GovValidatorsVoteLib.new();
    const govValidatorsExecuteLib = await GovValidatorsExecuteLib.new();

    await GovValidators.link(govValidatorsCreateLib);
    await GovValidators.link(govValidatorsVoteLib);
    await GovValidators.link(govValidatorsExecuteLib);

    const uniswapPathFinderLib = await UniswapPathFinderLib.new();

    await PriceFeed.link(uniswapPathFinderLib);

    testERC20 = await ERC20Mock.new("TestERC20", "TS", 18);
    testERC721 = await ERC721Mock.new("TestERC721", "TS");

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
    const uniswapV3Quoter = await UniswapV3QuoterMock.new();

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
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V3_QUOTER_NAME(), uniswapV3Quoter.address);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());
    poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init([]);
    await poolRegistry.__OwnablePoolContractsRegistry_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_FACTORY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());

    let distributionProposal = await DistributionProposal.new();
    let tokenSaleProposal = await TokenSaleProposal.new();
    let expertNft = await ERC721Expert.new();
    let nftMultiplier = await ERC721Multiplier.new();
    let linearPower = await LinearPower.new();
    let polynomialPower = await PolynomialPower.new();

    let govPool = await GovPool.new();
    let govUserKeeper = await GovUserKeeper.new();
    let govSettings = await GovSettings.new();
    let govValidators = await GovValidators.new();

    const poolNames = [
      await poolRegistry.GOV_POOL_NAME(),
      await poolRegistry.USER_KEEPER_NAME(),
      await poolRegistry.SETTINGS_NAME(),
      await poolRegistry.VALIDATORS_NAME(),
      await poolRegistry.DISTRIBUTION_PROPOSAL_NAME(),
      await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
      await poolRegistry.EXPERT_NFT_NAME(),
      await poolRegistry.NFT_MULTIPLIER_NAME(),
      await poolRegistry.LINEAR_POWER_NAME(),
      await poolRegistry.POLYNOMIAL_POWER_NAME(),
    ];

    const poolAddrs = [
      govPool.address,
      govUserKeeper.address,
      govSettings.address,
      govValidators.address,
      distributionProposal.address,
      tokenSaleProposal.address,
      expertNft.address,
      nftMultiplier.address,
      linearPower.address,
      polynomialPower.address,
    ];

    await poolRegistry.setNewImplementations(poolNames, poolAddrs);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("GovPools", () => {
    function getGovPoolSaleConfiguredParams() {
      let POOL_PARAMETERS = {
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
                voteRewardsCoefficient: 0,
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
                voteRewardsCoefficient: 0,
              },
              executorDescription: "internal",
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
                voteRewardsCoefficient: 0,
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
        tokenSaleParams: {
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
              participationDetails: [
                {
                  participationType: ParticipationType.Whitelist,
                  data: "0x",
                },
              ],
            },
          ],
          whitelistParams: [],
          tokenParams: {
            name: "gov token",
            symbol: "st",
            users: [],
            saleAmount: wei("100"),
            cap: wei("1000"),
            mintedTotal: wei("150"),
            amounts: [],
          },
        },
        votePowerParams: {
          voteType: VotePowerType.LINEAR_VOTES,
          initData: getBytesLinearPowerInit(),
          presetAddress: ZERO_ADDR,
        },
        verifier: OWNER,
        onlyBABTHolders: false,
        descriptionURL: "example.com",
        name: "Pool name",
      };

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
          voteRewardsCoefficient: 0,
        },
        executorDescription: "Token Sale",
      });

      POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(ZERO_ADDR);

      return POOL_PARAMETERS;
    }

    describe("deployGovPool", () => {
      it("should deploy pool and instantiate token sale", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        POOL_PARAMETERS.tokenSaleParams.tiersParams.push({
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
          participationDetails: [
            {
              participationType: ParticipationType.BABT,
              data: "0x",
            },
          ],
        });

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.tokenSaleParams.tiersParams[0].saleTokenAddress = predictedGovAddresses.govToken;
        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses.govToken;
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        let tx = await poolFactory.deployGovPool(POOL_PARAMETERS);
        let event = tx.receipt.logs[0];

        let tokenSale = await TokenSaleProposal.at(event.args.tokenSale);
        let token = await ERC20Mock.at(event.args.token);
        let dp = await DistributionProposal.at(event.args.distributionProposal);
        let localExpertNft = await ERC721Expert.at(event.args.govPoolDeps.expertNftAddress);
        let nftMultiplier = await ERC721Multiplier.at(event.args.govPoolDeps.nftMultiplierAddress);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(govPool.address, predictedGovAddresses.govPool);
        assert.equal(token.address, predictedGovAddresses.govToken);
        assert.equal(tokenSale.address, predictedGovAddresses.govTokenSale);
        assert.equal(dp.address, predictedGovAddresses.distributionProposal);
        assert.equal(localExpertNft.address, predictedGovAddresses.expertNft);
        assert.equal(nftMultiplier.address, predictedGovAddresses.nftMultiplier);

        let helperContracts = await govPool.getHelperContracts();

        let govUserKeeper = await GovUserKeeper.at(helperContracts[1]);

        assert.equal(await token.totalSupply(), wei("150"));
        assert.equal(await token.balanceOf(govPool.address), wei("50"));
        assert.equal(await token.balanceOf(tokenSale.address), wei("100"));

        assert.equal(await tokenSale.latestTierId(), "2");

        assert.equal(await govUserKeeper.tokenAddress(), token.address);

        const votePower = await PolynomialPower.at(helperContracts[4]);

        assert.equal(await votePower.transformVotes(ZERO_ADDR, 2), 2);
      });

      it("should deploy pool with empty token sale", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        let tx = await poolFactory.deployGovPool(POOL_PARAMETERS);
        let event = tx.receipt.logs[0];

        let tokenSale = await TokenSaleProposal.at(event.args.tokenSale);
        let token = await ERC20Mock.at(event.args.token);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        let govUserKeeper = await GovUserKeeper.at(helperContracts[1]);

        assert.equal(await tokenSale.latestTierId(), "0");

        assert.equal(await govUserKeeper.tokenAddress(), token.address);
        assert.equal(await govUserKeeper.tokenAddress(), testERC20.address);
      });

      it("should set babt id correctly", async () => {
        await babt.attest(OWNER);

        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(await govPool.deployerBABTid(), "1");
      });

      it("should deploy pool with polynomial votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.voteType = VotePowerType.POLYNOMIAL_VOTES;
        POOL_PARAMETERS.votePowerParams.initData = getBytesPolynomialPowerInit(1, 2, 3);

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        const votePower = await PolynomialPower.at(helperContracts[4]);

        assert.equal((await votePower.getVoteCoefficients())[0], 1);
        assert.equal((await votePower.getVoteCoefficients())[1], 2);
        assert.equal((await votePower.getVoteCoefficients())[2], 3);
      });

      it("should deploy pool with custom votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.voteType = VotePowerType.CUSTOM_VOTES;
        POOL_PARAMETERS.votePowerParams.initData = "0x";
        POOL_PARAMETERS.votePowerParams.presetAddress = (await LinearPower.new()).address;

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        const votePower = await LinearPower.at(helperContracts[4]);

        assert.equal(await votePower.transformVotes(ZERO_ADDR, 2), 2);
      });

      it("should revert if error during init polynomial votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.initData = getBytesPolynomialPowerInit(1, 2, 3);

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await truffleAssert.reverts(poolFactory.deployGovPool(POOL_PARAMETERS), "PoolFactory: power init failed");
      });
    });

    describe("deploy2 validation", () => {
      it("should deploy pools with the same name from different deployers", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddressOwner = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];
        const predictedAddressSecond = (await poolFactory.predictGovAddresses(SECOND, POOL_PARAMETERS.name))[0];

        assert.notEqual(predictedAddressOwner, ZERO_ADDR);
        assert.notEqual(predictedAddressSecond, ZERO_ADDR);
        assert.notEqual(predictedAddressOwner, predictedAddressSecond);

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);
        await poolFactory.deployGovPool(POOL_PARAMETERS, { from: SECOND });

        assert.deepEqual(await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 2), [
          predictedAddressOwner,
          predictedAddressSecond,
        ]);
      });

      it("should not deploy pools with the same salt", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name is already taken"
        );
      });

      it("should revert if name is an empty string", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        POOL_PARAMETERS.tokenSaleParams.tiersParams.pop();
        POOL_PARAMETERS.name = "";

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name cannot be empty"
        );
      });
    });

    describe("predictGovAddress", () => {
      it("should return zero address if name is an empty string", async () => {
        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, "");

        assert.equal(predictedAddress.govPool, ZERO_ADDR);
        assert.equal(predictedAddress.govToken, ZERO_ADDR);
        assert.equal(predictedAddress.govTokenSale, ZERO_ADDR);
        assert.equal(predictedAddress.distributionProposal, ZERO_ADDR);
        assert.equal(predictedAddress.expertNft, ZERO_ADDR);
        assert.equal(predictedAddress.nftMultiplier, ZERO_ADDR);
      });
    });
  });
});
