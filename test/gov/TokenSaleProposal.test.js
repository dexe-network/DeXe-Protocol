const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { PRECISION, ZERO_ADDR, PERCENTAGE_100, ETHER_ADDR } = require("../../scripts/utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { DEFAULT_CORE_PROPERTIES, ParticipationType } = require("../utils/constants");
const {
  getBytesTransfer,
  getBytesCreateTiersTSP,
  getBytesOffTiersTSP,
  getBytesRecoverTSP,
  getBytesAddToWhitelistTSP,
  getBytesLockParticipationTokensTSP,
  getBytesLockParticipationNftTSP,
  getBytesBuyTSP,
} = require("../utils/gov-pool-utils");
const { getCurrentBlockTime, setTime } = require("../helpers/block-helper");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposalMock");
const ERC20Sale = artifacts.require("ERC20Sale");
const BABTMock = artifacts.require("BABTMock");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolStakingLib = artifacts.require("GovPoolStaking");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");
const TokenSaleProposalCreateLib = artifacts.require("TokenSaleProposalCreate");
const TokenSaleProposalBuyLib = artifacts.require("TokenSaleProposalBuy");
const TokenSaleProposalVestingLib = artifacts.require("TokenSaleProposalVesting");
const TokenSaleProposalWhitelistLib = artifacts.require("TokenSaleProposalWhitelist");
const TokenSaleProposalClaimLib = artifacts.require("TokenSaleProposalClaim");
const TokenSaleProposalRecoverLib = artifacts.require("TokenSaleProposalRecover");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
ERC20Sale.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
TokenSaleProposal.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";

describe.only("TokenSaleProposal", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let purchaseToken1;
  let purchaseToken2;
  let saleToken;
  let erc20Params;
  let tiers;

  let tsp;
  let erc20Sale;

  let FACTORY;
  let NOTHING;

  let coreProperties;
  let poolRegistry;

  let token;
  let participationToken;
  let participationNft;

  let settings;
  let validators;
  let userKeeper;
  let govPool;
  let dp;
  let babt;

  const defaultDaoVotes = toBN(wei("100"));
  const defaultTokenAmount = toBN(wei("100"));

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(4);
    NOTHING = await accounts(9);

    const govUserKeeperViewLib = await GovUserKeeperViewLib.new();

    const govPoolCreateLib = await GovPoolCreateLib.new();
    const govPoolExecuteLib = await GovPoolExecuteLib.new();
    const govPoolRewardsLib = await GovPoolRewardsLib.new();
    const govPoolUnlockLib = await GovPoolUnlockLib.new();
    const govPoolVoteLib = await GovPoolVoteLib.new();
    const govPoolViewLib = await GovPoolViewLib.new();
    const govPoolStakingLib = await GovPoolStakingLib.new();
    const govPoolOffchainLib = await GovPoolOffchainLib.new();

    const tspCreateLib = await TokenSaleProposalCreateLib.new();
    const tspBuyLib = await TokenSaleProposalBuyLib.new();
    const tspVestingLib = await TokenSaleProposalVestingLib.new();
    const tspWhitelistLib = await TokenSaleProposalWhitelistLib.new();
    const tspClaimLib = await TokenSaleProposalClaimLib.new();
    const tspRecoverLib = await TokenSaleProposalRecoverLib.new();

    await GovUserKeeper.link(govUserKeeperViewLib);

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
    await GovPool.link(govPoolStakingLib);
    await GovPool.link(govPoolOffchainLib);

    await TokenSaleProposal.link(tspCreateLib);
    await TokenSaleProposal.link(tspBuyLib);
    await TokenSaleProposal.link(tspVestingLib);
    await TokenSaleProposal.link(tspWhitelistLib);
    await TokenSaleProposal.link(tspClaimLib);
    await TokenSaleProposal.link(tspRecoverLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    babt = await BABTMock.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    participationToken = await ERC20Mock.new("PTMock", "PTMock", 18);
    participationNft = await ERC721Mock.new("PNFTMock", "PNFTMock");

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);

    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babt.address);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await poolRegistry.__OwnablePoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  async function deployPool(poolParams) {
    const NAME = await poolRegistry.GOV_POOL_NAME();

    settings = await GovSettings.new();
    validators = await GovValidators.new();
    userKeeper = await GovUserKeeper.new();
    dp = await DistributionProposal.new();
    govPool = await GovPool.new();
    tsp = await TokenSaleProposal.new();

    await settings.__GovSettings_init(
      govPool.address,
      dp.address,
      validators.address,
      userKeeper.address,
      poolParams.settingsParams.proposalSettings,
      poolParams.settingsParams.additionalProposalExecutors
    );

    await validators.__GovValidators_init(
      poolParams.validatorsParams.name,
      poolParams.validatorsParams.symbol,
      poolParams.validatorsParams.duration,
      poolParams.validatorsParams.quorum,
      poolParams.validatorsParams.validators,
      poolParams.validatorsParams.balances
    );
    await userKeeper.__GovUserKeeper_init(
      poolParams.userKeeperParams.tokenAddress,
      poolParams.userKeeperParams.nftAddress,
      poolParams.userKeeperParams.totalPowerInTokens,
      poolParams.userKeeperParams.nftsTotalSupply
    );

    await dp.__DistributionProposal_init(govPool.address);
    await govPool.__GovPool_init(
      settings.address,
      userKeeper.address,
      dp.address,
      validators.address,
      poolParams.nftMultiplierAddress,
      OWNER,
      poolParams.onlyBABTHolders,
      poolParams.deployerBABTid,
      poolParams.descriptionURL,
      poolParams.name
    );

    await settings.transferOwnership(govPool.address);
    await validators.transferOwnership(govPool.address);
    await userKeeper.transferOwnership(govPool.address);

    await poolRegistry.addProxyPool(NAME, govPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);
  }

  async function setupTokens() {
    await token.mint(OWNER, wei("100000000000"));
    await token.approve(userKeeper.address, wei("10000000000"));

    await token.mint(SECOND, wei("100000000000000000000"));
    await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

    await govPool.deposit(OWNER, wei("1000"), []);
    await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
  }

  describe("init", () => {
    beforeEach(async () => {
      tsp = await TokenSaleProposal.new();
    });

    it("should not init twice", async () => {
      await tsp.__TokenSaleProposal_init(NOTHING, NOTHING);

      await truffleAssert.reverts(
        tsp.__TokenSaleProposal_init(NOTHING, NOTHING),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("proposals", () => {
    const acceptProposal = async (actionsFor, actionsAgainst = []) => {
      await govPool.createProposal("example.com", "misc", actionsFor, actionsAgainst);

      const proposalId = await govPool.latestProposalId();

      await govPool.vote(proposalId, wei("1000"), [], true);
      await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

      await govPool.execute(proposalId);
    };

    const tierInitParamsToObject = (tierInitParams) => {
      return {
        metadata: {
          name: tierInitParams.metadata.name,
          description: tierInitParams.metadata.description,
        },
        totalTokenProvided: tierInitParams.totalTokenProvided,
        saleStartTime: tierInitParams.saleStartTime,
        saleEndTime: tierInitParams.saleEndTime,
        claimLockDuration: tierInitParams.claimLockDuration,
        saleTokenAddress: tierInitParams.saleTokenAddress,
        purchaseTokenAddresses: tierInitParams.purchaseTokenAddresses,
        exchangeRates: tierInitParams.exchangeRates,
        minAllocationPerUser: tierInitParams.minAllocationPerUser,
        maxAllocationPerUser: tierInitParams.maxAllocationPerUser,
        vestingSettings: {
          vestingPercentage: tierInitParams.vestingSettings.vestingPercentage,
          vestingDuration: tierInitParams.vestingSettings.vestingDuration,
          cliffPeriod: tierInitParams.vestingSettings.cliffPeriod,
          unlockStep: tierInitParams.vestingSettings.unlockStep,
        },
        participationDetails: {
          participationType: tierInitParams.participationDetails.participationType,
          data: tierInitParams.participationDetails.data,
        },
      };
    };

    const tierInitParamsToObjects = (tierInitParams) => {
      return tierInitParams.map((e) => tierInitParamsToObject(e));
    };

    const userViewToObject = (userView) => {
      return {
        canParticipate: userView.canParticipate,
        purchaseView: {
          isClaimed: userView.purchaseView.isClaimed,
          canClaim: userView.purchaseView.canClaim,
          claimUnlockTime: userView.purchaseView.claimUnlockTime,
          claimTotalAmount: userView.purchaseView.claimTotalAmount,
          boughtTotalAmount: userView.purchaseView.boughtTotalAmount,
          lockedAmount: userView.purchaseView.lockedAmount,
          lockedId: userView.purchaseView.lockedId,
          purchaseTokenAddresses: userView.purchaseView.purchaseTokenAddresses,
          purchaseTokenAmounts: userView.purchaseView.purchaseTokenAmounts,
        },
        vestingUserView: {
          latestVestingWithdraw: userView.vestingUserView.latestVestingWithdraw,
          vestingTotalAmount: userView.vestingUserView.vestingTotalAmount,
          vestingWithdrawnAmount: userView.vestingUserView.vestingWithdrawnAmount,
        },
      };
    };

    const userViewsToObjects = (userViews) => {
      return userViews.map((e) => userViewToObject(e));
    };

    const lockParticipationTokensAndBuy = async (tierId, tokenToBuyWith, amount, from) => {
      await tsp.multicall(
        [getBytesLockParticipationTokensTSP(tierId), getBytesBuyTSP(tierId, tokenToBuyWith, amount)],
        { from: from }
      );
    };

    const lockParticipationNftAndBuy = async (tierId, tokenId, tokenToBuyWith, amount, from) => {
      await tsp.multicall(
        [getBytesLockParticipationNftTSP(tierId, tokenId), getBytesBuyTSP(tierId, tokenToBuyWith, amount)],
        { from: from }
      );
    };

    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        settingsParams: {
          proposalSettings: [
            {
              earlyCompletion: true,
              delegatedVotingAllowed: true,
              validatorsVote: false,
              duration: 700,
              durationValidators: 800,
              quorum: PRECISION.times("71").toFixed(),
              quorumValidators: PRECISION.times("100").toFixed(),
              minVotesForVoting: wei("20"),
              minVotesForCreating: wei("3"),
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
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("2"),
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
              delegatedVotingAllowed: false,
              validatorsVote: false,
              duration: 700,
              durationValidators: 800,
              quorum: PRECISION.times("71").toFixed(),
              quorumValidators: PRECISION.times("100").toFixed(),
              minVotesForVoting: wei("20"),
              minVotesForCreating: wei("3"),
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
              delegatedVotingAllowed: true,
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("2"),
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
          duration: 600,
          quorum: PRECISION.times("51").toFixed(),
          validators: [OWNER, SECOND],
          balances: [wei("100"), wei("1000000000000")],
        },
        userKeeperParams: {
          tokenAddress: token.address,
          nftAddress: ZERO_ADDR,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        nftMultiplierAddress: ZERO_ADDR,
        onlyBABTHolders: false,
        deployerBABTid: 1,
        descriptionURL: "example.com",
        name: "Pool name",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();

      await tsp.__TokenSaleProposal_init(govPool.address, babt.address);

      erc20Params = {
        govAddress: govPool.address,
        saleAddress: tsp.address,
        constructorParameters: {
          name: "ERC20SaleMocked",
          symbol: "ERC20SM",
          users: [SECOND, THIRD],
          saleAmount: wei(1000),
          cap: wei(2000),
          mintedTotal: wei(1005),
          amounts: [wei(2), wei(3)],
        },
      };

      erc20Sale = await ERC20Sale.new();

      erc20Sale.__ERC20Sale_init(erc20Params.govAddress, erc20Params.saleAddress, erc20Params.constructorParameters);

      purchaseToken1 = await ERC20Mock.new("PurchaseMockedToken1", "PMT1", 18);
      purchaseToken2 = await ERC20Mock.new("PurchaseMockedToken1", "PMT1", 18);
      saleToken = await ERC20Mock.new("SaleMockedToken", "SMT", 18);

      const timeNow = await getCurrentBlockTime();

      tiers = [
        {
          metadata: {
            name: "tier 1",
            description: "the first tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 100).toString(),
          saleEndTime: (timeNow + 200).toString(),
          claimLockDuration: "10",
          saleTokenAddress: erc20Sale.address,
          purchaseTokenAddresses: [purchaseToken1.address, ETHER_ADDR],
          exchangeRates: [PRECISION.times(3).toFixed(), PRECISION.times(100).toFixed()],
          minAllocationPerUser: wei(20),
          maxAllocationPerUser: wei(600),
          vestingSettings: {
            vestingPercentage: PERCENTAGE_100.idiv(5).toFixed(),
            vestingDuration: "100",
            cliffPeriod: "50",
            unlockStep: "3",
          },
          participationDetails: {
            participationType: ParticipationType.Whitelist,
            data: "0x",
          },
        },
        {
          metadata: {
            name: "tier 2",
            description: "the second tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 1000).toString(),
          saleEndTime: (timeNow + 2000).toString(),
          claimLockDuration: "0",
          saleTokenAddress: saleToken.address,
          purchaseTokenAddresses: [purchaseToken1.address, purchaseToken2.address],
          exchangeRates: [PRECISION.times(4).toFixed(), PRECISION.idiv(4).toFixed()],
          minAllocationPerUser: "0",
          maxAllocationPerUser: "0",
          vestingSettings: {
            vestingPercentage: "0",
            vestingDuration: "0",
            cliffPeriod: "0",
            unlockStep: "0",
          },
          participationDetails: {
            participationType: ParticipationType.DAOVotes,
            data: web3.eth.abi.encodeParameter("uint256", defaultDaoVotes),
          },
        },
        {
          metadata: {
            name: "tier 3",
            description: "the third tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 1000).toString(),
          saleEndTime: (timeNow + 2000).toString(),
          claimLockDuration: "0",
          saleTokenAddress: saleToken.address,
          purchaseTokenAddresses: [purchaseToken1.address, purchaseToken2.address],
          exchangeRates: [PRECISION.times(4).toFixed(), PRECISION.idiv(4).toFixed()],
          minAllocationPerUser: "0",
          maxAllocationPerUser: "0",
          vestingSettings: {
            vestingPercentage: "0",
            vestingDuration: "0",
            cliffPeriod: "0",
            unlockStep: "0",
          },
          participationDetails: {
            participationType: ParticipationType.BABT,
            data: "0x",
          },
        },
        {
          metadata: {
            name: "tier 4",
            description: "the fourth tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 1000).toString(),
          saleEndTime: (timeNow + 2000).toString(),
          claimLockDuration: "0",
          saleTokenAddress: saleToken.address,
          purchaseTokenAddresses: [purchaseToken1.address, purchaseToken2.address],
          exchangeRates: [PRECISION.times(4).toFixed(), PRECISION.idiv(4).toFixed()],
          minAllocationPerUser: "0",
          maxAllocationPerUser: "0",
          vestingSettings: {
            vestingPercentage: "0",
            vestingDuration: "0",
            cliffPeriod: "0",
            unlockStep: "0",
          },
          participationDetails: {
            participationType: ParticipationType.TokenLock,
            data: web3.eth.abi.encodeParameters(
              ["address", "uint256"],
              [participationToken.address, defaultTokenAmount]
            ),
          },
        },
        {
          metadata: {
            name: "tier 5",
            description: "the fifth tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 1000).toString(),
          saleEndTime: (timeNow + 2000).toString(),
          claimLockDuration: "0",
          saleTokenAddress: saleToken.address,
          purchaseTokenAddresses: [purchaseToken1.address, purchaseToken2.address],
          exchangeRates: [PRECISION.times(4).toFixed(), PRECISION.idiv(4).toFixed()],
          minAllocationPerUser: "0",
          maxAllocationPerUser: "0",
          vestingSettings: {
            vestingPercentage: "0",
            vestingDuration: "0",
            cliffPeriod: "0",
            unlockStep: "0",
          },
          participationDetails: {
            participationType: ParticipationType.NftLock,
            data: web3.eth.abi.encodeParameter("address", participationNft.address),
          },
        },
        {
          metadata: {
            name: "tier 4",
            description: "the fourth tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: (timeNow + 1000).toString(),
          saleEndTime: (timeNow + 2000).toString(),
          claimLockDuration: "0",
          saleTokenAddress: saleToken.address,
          purchaseTokenAddresses: [purchaseToken1.address, purchaseToken2.address],
          exchangeRates: [PRECISION.times(4).toFixed(), PRECISION.idiv(4).toFixed()],
          minAllocationPerUser: "0",
          maxAllocationPerUser: "0",
          vestingSettings: {
            vestingPercentage: "0",
            vestingDuration: "0",
            cliffPeriod: "0",
            unlockStep: "0",
          },
          participationDetails: {
            participationType: ParticipationType.TokenLock,
            data: web3.eth.abi.encodeParameters(["address", "uint256"], [ETHER_ADDR, defaultTokenAmount]),
          },
        },
      ];
    });

    describe("latestTierId", () => {
      it("latestTierId should increase when tiers are created", async () => {
        assert.equal(await tsp.latestTierId(), 0);

        await saleToken.mint(govPool.address, wei(5000));

        await acceptProposal([
          [saleToken.address, 0, getBytesTransfer(tsp.address, wei(5000))],
          [tsp.address, 0, getBytesCreateTiersTSP(tiers)],
        ]);

        assert.equal(await tsp.latestTierId(), 6);
      });
    });

    describe("createTiers", () => {
      it("should not create tiers if caller is not govPool", async () => {
        await truffleAssert.reverts(tsp.createTiers(tiers), "TSP: not a Gov contract");
      });

      it("should not create tiers if saleTokenAddress is zero", async () => {
        tiers[0].saleTokenAddress = ZERO_ADDR;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: sale token cannot be zero"
        );
      });

      it("should not create tiers if saleTokenAddress is ether address", async () => {
        tiers[0].saleTokenAddress = ETHER_ADDR;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: cannot sale native currency"
        );
      });

      it("should not create tiers if sale token is not provided", async () => {
        tiers[0].totalTokenProvided = 0;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: sale token is not provided"
        );
      });

      it("should not create tiers if saleStartTime > saleEndTime", async () => {
        tiers[0].saleStartTime = tiers[0].saleEndTime + 1;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: saleEndTime is less than saleStartTime"
        );
      });

      it("should not create tiers if minAllocationPerUser > maxAllocationPerUser", async () => {
        tiers[0].minAllocationPerUser = tiers[0].maxAllocationPerUser + 1;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: wrong allocation"
        );
      });

      it("should not create tiers if vestingPercentage > 100%", async () => {
        tiers[0].vestingSettings.vestingPercentage = toBN(PERCENTAGE_100).plus(1).toFixed();

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if vestingPercentage is not zero and unlockStep is zero", async () => {
        tiers[0].vestingSettings.unlockStep = 0;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if vestingDuration < unlockStep", async () => {
        tiers[0].vestingSettings.vestingDuration = 0;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if no purchaseTokenAddresses provided", async () => {
        tiers[0].purchaseTokenAddresses = [];

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: purchase tokens are not provided"
        );
      });

      it("should not create tiers if purchaseTokenAddresses weren't provided", async () => {
        tiers[0].purchaseTokenAddresses = [];

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: purchase tokens are not provided"
        );
      });

      it("should not create tiers if purchaseTokenAddresses and exchangeRates lengths mismatch", async () => {
        tiers[0].purchaseTokenAddresses = tiers[0].purchaseTokenAddresses.slice(0, 1);

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: tokens and rates lengths mismatch"
        );
      });

      it("should not create tiers if the purchaseTokenAddress is zero", async () => {
        tiers[0].purchaseTokenAddresses[1] = ZERO_ADDR;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: purchase token cannot be zero"
        );
      });

      it("should not create tiers if the exchange rate is zero", async () => {
        tiers[0].exchangeRates[1] = 0;

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          [],
          "TSP: rate cannot be zero"
        );
      });

      it("should not create tiers if purchaseTokenAddresses are duplicated", async () => {
        tiers[0].purchaseTokenAddresses[0] = tiers[0].purchaseTokenAddresses[1];

        await truffleAssert.reverts(
          acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(tiers.slice(0, 1))]]),
          "TSP: purchase tokens are duplicated"
        );
      });

      it("should create tiers if all conditions are met", async () => {
        await acceptProposal([[tsp.address, 0, getBytesCreateTiersTSP(JSON.parse(JSON.stringify(tiers)))]]);

        assert.deepEqual(
          tierInitParamsToObjects((await tsp.getTierViews(0, 6)).map((tier) => tier.tierInitParams)),
          tiers
        );
      });
    });

    describe("if tiers are created", () => {
      beforeEach(async () => {
        await saleToken.mint(govPool.address, wei(5000));

        await acceptProposal([
          [saleToken.address, 0, getBytesTransfer(tsp.address, wei(5000))],
          [tsp.address, 0, getBytesCreateTiersTSP(JSON.parse(JSON.stringify(tiers)))],
        ]);

        await purchaseToken1.mint(OWNER, wei(1000));

        await network.provider.send("hardhat_setBalance", [OWNER, "0x" + wei("100000")]);
      });

      describe("addToWhitelist", () => {
        it("should not add to whitelist if wrong participation type", async () => {
          const whitelistingRequest = [
            {
              tierId: 2,
              users: [OWNER],
              uri: "",
            },
          ];

          await truffleAssert.reverts(
            acceptProposal([[tsp.address, 0, getBytesAddToWhitelistTSP(whitelistingRequest)]]),
            "TSP: wrong participation type"
          );
        });

        it("should not mint if not this contract", async () => {
          await truffleAssert.reverts(tsp.mint(OWNER, 1), "TSP: not this contract");
        });

        it("should add to whitelist and be able to participate if all conditions are met", async () => {
          assert.equal((await tsp.getTierViews(0, 1))[0].tierInfo.uri, "");
          assert.equal((await tsp.balanceOf(OWNER, 1)).toFixed(), "0");

          const whitelistingRequest = [
            {
              tierId: 1,
              users: [OWNER],
              uri: "uri_success",
            },
          ];

          await acceptProposal([[tsp.address, 0, getBytesAddToWhitelistTSP(whitelistingRequest)]]);

          assert.equal((await tsp.getTierViews(0, 1))[0].tierInfo.uri, "uri_success");
          assert.equal((await tsp.balanceOf(OWNER, 1)).toFixed(), "1");
        });
      });

      describe("lockParticipationTokens", () => {
        it("should not lock participation tokens if wrong participation type", async () => {
          await truffleAssert.reverts(tsp.lockParticipationTokens(5), "TSP: wrong participation type");
        });

        it("should not lock participation tokens if already locked", async () => {
          await participationToken.mint(OWNER, defaultTokenAmount.multipliedBy(2));
          await participationToken.approve(tsp.address, defaultTokenAmount.multipliedBy(2));

          await tsp.lockParticipationTokens(4);

          await truffleAssert.reverts(tsp.lockParticipationTokens(4), "TSP: already locked");
        });

        it("should not lock participation tokens if wrong lock amount", async () => {
          await truffleAssert.reverts(tsp.lockParticipationTokens(6), "TSP: wrong lock amount");
        });

        it("should lock participation tokens if all conditions are met (erc20)", async () => {
          assert.equal((await tsp.getUserViews(OWNER, [4]))[0].purchaseView.lockedAmount, "0");

          await participationToken.mint(OWNER, defaultTokenAmount);
          await participationToken.approve(tsp.address, defaultTokenAmount);

          await tsp.lockParticipationTokens(4);

          assert.equal((await tsp.getUserViews(OWNER, [4]))[0].purchaseView.lockedAmount, defaultTokenAmount.toFixed());
        });

        it("should lock participation tokens if all conditions are met (native)", async () => {
          assert.equal((await tsp.getUserViews(OWNER, [6]))[0].purchaseView.lockedAmount, "0");

          await tsp.lockParticipationTokens(6, { value: defaultTokenAmount });

          assert.equal((await tsp.getUserViews(OWNER, [6]))[0].purchaseView.lockedAmount, defaultTokenAmount.toFixed());
        });
      });

      describe("lockParticipationNft", () => {
        it("should not lock participation nft if wrong participation type", async () => {
          await participationNft.safeMint(OWNER, 1);
          await participationNft.approve(tsp.address, 1);

          await truffleAssert.reverts(tsp.lockParticipationNft(4, 1), "TSP: wrong participation type");
        });

        it("should not lock participation nft if already locked", async () => {
          await participationNft.safeMint(OWNER, 1);
          await participationNft.safeMint(OWNER, 2);
          await participationNft.setApprovalForAll(tsp.address, true);

          await tsp.lockParticipationNft(5, 1);

          await truffleAssert.reverts(tsp.lockParticipationNft(5, 2), "TSP: already locked");
        });

        it("should lock participation nft if all conditions are met", async () => {
          assert.equal((await tsp.getUserViews(OWNER, [5]))[0].purchaseView.lockedId, "0");

          await participationNft.safeMint(OWNER, 1);
          await participationNft.approve(tsp.address, 1);

          await tsp.lockParticipationNft(5, 1);

          assert.equal((await tsp.getUserViews(OWNER, [5]))[0].purchaseView.lockedId, "1");
        });
      });

      describe("offTiers", () => {
        it("should not off tiers if caller is not govPool", async () => {
          await truffleAssert.reverts(tsp.offTiers([1, 2]), "TSP: not a Gov contract");
        });

        it("should not off tiers if the tier does not exist", async () => {
          const nonexistentOffTier = [10];

          await truffleAssert.reverts(
            acceptProposal([[tsp.address, 0, getBytesOffTiersTSP(nonexistentOffTier)]]),
            "TSP: tier does not exist"
          );
        });

        it("should not off tiers if the tier is already off", async () => {
          const doubleOffTier = [1, 1];

          await truffleAssert.reverts(
            acceptProposal([[tsp.address, 0, getBytesOffTiersTSP(doubleOffTier)]]),
            "TSP: tier is off"
          );
        });

        it("should off tiers if all conditions are met", async () => {
          const offTierIds = [1, 2];

          assert.deepEqual(
            (await tsp.getTierViews(0, 2)).map((tier) => tier.tierInfo.isOff),
            [false, false]
          );

          await acceptProposal([[tsp.address, 0, getBytesOffTiersTSP(offTierIds)]]);

          assert.deepEqual(
            (await tsp.getTierViews(0, 2)).map((tier) => tier.tierInfo.isOff),
            [true, true]
          );
        });
      });

      describe.only("buy", () => {
        it("should not buy if wrong native amount", async () => {
          await truffleAssert.reverts(tsp.buy(1, ETHER_ADDR, 0, { value: wei(1) }), "TSP: wrong native amount");
        });

        it("should not buy if zero amount", async () => {
          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, 0), "TSP: zero amount");
        });

        it("should not buy if cannot participate", async () => {
          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: cannot participate");
          await truffleAssert.reverts(
            tsp.buy(2, purchaseToken2.address, wei(20), { from: THIRD }),
            "TSP: cannot participate"
          );
          await truffleAssert.reverts(tsp.buy(3, purchaseToken1.address, wei(100)), "TSP: cannot participate");
          await truffleAssert.reverts(tsp.buy(4, purchaseToken1.address, wei(100)), "TSP: cannot participate");
          await truffleAssert.reverts(tsp.buy(5, purchaseToken1.address, wei(100)), "TSP: cannot participate");
        });

        it("should buy if all conditions are met (daoVotes)", async () => {
          await setTime(+tiers[1].saleStartTime);

          await token.mint(THIRD, defaultDaoVotes.plus(1));
          await purchaseToken2.mint(THIRD, wei(20));
          await purchaseToken2.approve(tsp.address, wei(20), { from: THIRD });

          await tsp.buy(2, purchaseToken2.address, wei(20), { from: THIRD });

          const purchaseView = {
            isClaimed: false,
            canClaim: false,
            claimUnlockTime: (+tiers[1].saleEndTime + +tiers[1].claimLockDuration).toString(),
            claimTotalAmount: wei(5),
            boughtTotalAmount: wei(5),
            lockedAmount: "0",
            lockedId: "0",
            purchaseTokenAddresses: [purchaseToken2.address],
            purchaseTokenAmounts: [wei(20)],
          };

          assert.deepEqual(userViewsToObjects(await tsp.getUserViews(THIRD, [2]))[0].purchaseView, purchaseView);
          assert.equal((await purchaseToken2.balanceOf(THIRD)).toFixed(), "0");
        });

        it("should buy if all conditions are met (babt)", async () => {
          await setTime(+tiers[2].saleStartTime);

          await babt.attest(OWNER);

          await purchaseToken1.approve(tsp.address, wei(100));

          await tsp.buy(3, purchaseToken1.address, wei(100));

          const purchaseView = {
            isClaimed: false,
            canClaim: false,
            claimUnlockTime: (+tiers[2].saleEndTime + +tiers[2].claimLockDuration).toString(),
            claimTotalAmount: wei(400),
            boughtTotalAmount: wei(400),
            lockedAmount: "0",
            lockedId: "0",
            purchaseTokenAddresses: [purchaseToken1.address],
            purchaseTokenAmounts: [wei(100)],
          };

          assert.deepEqual(userViewsToObjects(await tsp.getUserViews(OWNER, [3]))[0].purchaseView, purchaseView);
          assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(900));
        });

        it("should buy if all conditions are met (tokenLock)", async () => {
          await setTime(+tiers[3].saleStartTime);

          await participationToken.mint(OWNER, defaultTokenAmount);
          await participationToken.approve(tsp.address, defaultTokenAmount);
          await purchaseToken1.approve(tsp.address, wei(100));

          await lockParticipationTokensAndBuy(4, purchaseToken1.address, wei(100), OWNER);

          const purchaseView = {
            isClaimed: false,
            canClaim: false,
            claimUnlockTime: (+tiers[2].saleEndTime + +tiers[2].claimLockDuration).toString(),
            claimTotalAmount: wei(400),
            boughtTotalAmount: wei(400),
            lockedAmount: wei(100),
            lockedId: "0",
            purchaseTokenAddresses: [purchaseToken1.address],
            purchaseTokenAmounts: [wei(100)],
          };

          assert.deepEqual(userViewsToObjects(await tsp.getUserViews(OWNER, [4]))[0].purchaseView, purchaseView);
          assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(900));
        });

        it("should buy if all conditions are met (nftLock)", async () => {
          await setTime(+tiers[4].saleStartTime);

          await participationNft.safeMint(OWNER, 1);
          await participationNft.approve(tsp.address, 1);
          await purchaseToken1.approve(tsp.address, wei(100));

          await lockParticipationNftAndBuy(5, 1, purchaseToken1.address, wei(100), OWNER);

          const purchaseView = {
            isClaimed: false,
            canClaim: false,
            claimUnlockTime: (+tiers[4].saleEndTime + +tiers[4].claimLockDuration).toString(),
            claimTotalAmount: wei(400),
            boughtTotalAmount: wei(400),
            lockedAmount: "0",
            lockedId: "1",
            purchaseTokenAddresses: [purchaseToken1.address],
            purchaseTokenAmounts: [wei(100)],
          };

          assert.deepEqual(userViewsToObjects(await tsp.getUserViews(OWNER, [5]))[0].purchaseView, purchaseView);
          assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(900));
        });

        describe("if added to whitelist", () => {
          beforeEach(async () => {
            const whitelistingRequest = [
              {
                tierId: 1,
                users: [OWNER],
                uri: "",
              },
            ];

            await acceptProposal([[tsp.address, 0, getBytesAddToWhitelistTSP(whitelistingRequest)]]);
          });

          it("should not buy if cannot buy now", async () => {
            await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(10)), "TSP: cannot buy now");

            await setTime(+tiers[0].saleEndTime + 1);

            await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(10)), "TSP: cannot buy now");
          });

          it("should not buy if incorrect token", async () => {
            await setTime(+tiers[0].saleStartTime);

            await truffleAssert.reverts(tsp.buy(1, purchaseToken2.address, wei(10)), "TSP: incorrect token");
          });

          it("should not buy if wrong allocation", async () => {
            await setTime(+tiers[0].saleStartTime);

            await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(1)), "TSP: wrong allocation");
            await truffleAssert.reverts(tsp.buy(1, ETHER_ADDR, wei(7), { value: wei(7) }), "TSP: wrong allocation");
          });

          it("should not byy if insufficient sale token amount", async () => {
            await setTime(+tiers[1].saleStartTime);

            await purchaseToken1.approve(tsp.address, wei(200));
            await purchaseToken1.approve(tsp.address, wei(200), { from: SECOND });

            await tsp.buy(2, purchaseToken1.address, wei(200));
            await truffleAssert.reverts(
              tsp.buy(2, purchaseToken1.address, wei(200), { from: SECOND }),
              "TSP: insufficient sale token amount"
            );
          });

          it("should not buy if failed to transfer ether", async () => {
            await tsp.setGovPool(tsp.address);

            await setTime(+tiers[0].saleStartTime);

            await truffleAssert.reverts(
              tsp.buy(1, ETHER_ADDR, wei(1), { value: wei(1) }),
              "TSP: failed to transfer ether"
            );
          });

          it("should buy if all conditions are met", async () => {
            await setTime(+tiers[0].saleStartTime);

            await purchaseToken1.approve(tsp.address, wei(300));

            await tsp.buy(1, purchaseToken1.address, wei(200));

            assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(800));

            let purchaseView = {
              isClaimed: false,
              canClaim: false,
              claimUnlockTime: (+tiers[0].saleEndTime + +tiers[0].claimLockDuration).toString(),
              claimTotalAmount: wei(480),
              boughtTotalAmount: wei(600),
              lockedAmount: "0",
              lockedId: "0",
              purchaseTokenAddresses: [purchaseToken1.address],
              purchaseTokenAmounts: [wei(200)],
            };

            assert.deepEqual(userViewsToObjects(await tsp.getUserViews(OWNER, [1]))[0].purchaseView, purchaseView);

            const etherBalanceBefore = await web3.eth.getBalance(OWNER);

            const tx = await tsp.buy(1, ETHER_ADDR, wei(1), { value: wei(1) });

            assert.equal(
              toBN(etherBalanceBefore)
                .minus(toBN(tx.receipt.gasUsed).times(tx.receipt.effectiveGasPrice))
                .minus(await web3.eth.getBalance(OWNER))
                .toFixed(),
              wei(1)
            );

            purchaseView.claimTotalAmount = wei(560);
            purchaseView.boughtTotalAmount = wei(700);
            purchaseView.purchaseTokenAddresses.push(ETHER_ADDR);
            purchaseView.purchaseTokenAmounts.push(wei(1));

            assert.deepEqual(userViewsToObjects(await tsp.getUserViews(OWNER, [1]))[0].purchaseView, purchaseView);

            await tsp.buy(1, purchaseToken1.address, wei(100));

            assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(700));

            purchaseView.claimTotalAmount = wei(700);
            purchaseView.boughtTotalAmount = wei(1000);
            purchaseView.purchaseTokenAmounts[0] = wei(300);
          });
        });
      });

      describe("if purchases are made", () => {
        beforeEach(async () => {
          for (let i = 0; i < 5; ++i) {
            await setTime(+tiers[i].saleStartTime);
          }

          await setTime(+tiers[0].saleStartTime);

          await participationToken.mint(OWNER, defaultTokenAmount);
          await participationToken.approve(tsp.address, defaultTokenAmount);
          await participationNft.safeMint(OWNER, 1);
          await participationNft.approve(tsp.address, 1);
        });

        describe("claim", () => {});

        describe("vestingWithdraw", () => {});

        describe("recover", () => {
          beforeEach(async () => {
            const whitelistingRequest = [
              {
                tierId: 1,
                users: [OWNER],
                uri: "",
              },
            ];

            await acceptProposal([[tsp.address, 0, getBytesAddToWhitelistTSP(whitelistingRequest)]]);

            await purchaseToken1.approve(tsp.address, wei(200));

            await setTime(+tiers[0].saleStartTime);
            await tsp.buy(1, purchaseToken1.address, wei(200));
          });

          it("should not recover if recover conditions were not met", async () => {
            assert.deepEqual(
              (await tsp.getRecoverAmounts([1, 2])).map((amount) => amount.toFixed()),
              ["0", "0"]
            );
          });

          it("should not recover if caller is not govPool", async () => {
            await truffleAssert.reverts(tsp.recover([3]), "TSP: not a Gov contract");
          });

          it("should not recover if the tier does not exist", async () => {
            await truffleAssert.reverts(
              acceptProposal([[tsp.address, 0, getBytesRecoverTSP([10])]]),
              "TSP: tier does not exist"
            );
          });

          it("should not recover the same tier twice", async () => {
            await truffleAssert.reverts(
              acceptProposal([[tsp.address, 0, getBytesRecoverTSP([1, 1])]]),
              "TSP: zero recovery"
            );
          });

          it("should recover if the tier is off", async () => {
            await acceptProposal([[tsp.address, 0, getBytesOffTiersTSP([1])]]);

            assert.deepEqual(
              (await tsp.getRecoverAmounts([1, 2])).map((amount) => amount.toFixed()),
              [wei("400"), "0"]
            );

            await acceptProposal([[tsp.address, 0, getBytesRecoverTSP([1])]]);

            assert.equal((await erc20Sale.balanceOf(govPool.address)).toFixed(), wei("400"));
            assert.equal((await saleToken.balanceOf(govPool.address)).toFixed(), "0");
          });

          it("should recover if all conditions are met", async () => {
            await setTime(+tiers[0].saleEndTime + 1);

            assert.deepEqual(
              (await tsp.getRecoverAmounts([1, 2])).map((amount) => amount.toFixed()),
              [wei("400"), "0"]
            );

            await acceptProposal([[tsp.address, 0, getBytesRecoverTSP([1])]]);

            assert.equal((await erc20Sale.balanceOf(govPool.address)).toFixed(), wei("400"));
            assert.equal((await saleToken.balanceOf(govPool.address)).toFixed(), "0");
          });
        });

        describe("unlockParticipationTokens", () => {});

        describe("unlockParticipationNft", () => {});
      });
    });
  });
});
