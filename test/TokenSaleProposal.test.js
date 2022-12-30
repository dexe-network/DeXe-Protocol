const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/utils/utils");
const { PRECISION, ZERO_ADDR, PERCENTAGE_100, ETHER_ADDR } = require("../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const { DEFAULT_CORE_PROPERTIES } = require("./utils/constants");
const {
  getBytesTransfer,
  getBytesCreateTiersTSP,
  getBytesOffTiersTSP,
  getBytesAddToWhitelistTSP,
} = require("./utils/gov-pool-utils");
const { getCurrentBlockTime, setTime } = require("./helpers/block-helper");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");
const ERC20Sale = artifacts.require("ERC20Sale");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolStakingLib = artifacts.require("GovPoolStaking");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC20Sale.numberFormat = "BigNumber";
TokenSaleProposal.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";

describe("TokenSaleProposal", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let purchaseToken1;
  let purchaseToken2;
  let sellToken;
  let erc20Params;
  let tiers;

  let tsp;
  let erc20Sale;

  let FACTORY;
  let NOTHING;

  let coreProperties;
  let poolRegistry;

  let token;
  let nft;

  let settings;
  let validators;
  let userKeeper;
  let govPool;
  let dp;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    SALE_ADDRESS = await accounts(3);
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

    await GovUserKeeper.link(govUserKeeperViewLib);

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
    await GovPool.link(govPoolStakingLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await poolRegistry.__OwnablePoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
  });

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

  describe("init", () => {});

  describe("proposals", () => {
    const acceptProposal = async (executors, values, bytes) => {
      await govPool.createProposal("example.com", "misc", executors, values, bytes);

      const proposalId = await govPool.latestProposalId();

      await govPool.vote(proposalId, 0, [], wei("1000"), []);
      await govPool.vote(proposalId, 0, [], wei("100000000000000000000"), [], { from: SECOND });

      await govPool.execute(proposalId);
    };

    const tierViewToObject = (tierView) => {
      return {
        metadata: {
          name: tierView.metadata.name,
          description: tierView.metadata.description,
        },
        totalTokenProvided: tierView.totalTokenProvided,
        saleStartTime: tierView.saleStartTime,
        saleEndTime: tierView.saleEndTime,
        saleTokenAddress: tierView.saleTokenAddress,
        purchaseTokenAddresses: tierView.purchaseTokenAddresses,
        exchangeRates: tierView.exchangeRates,
        minAllocationPerUser: tierView.minAllocationPerUser,
        maxAllocationPerUser: tierView.maxAllocationPerUser,
        vestingSettings: {
          vestingPercentage: tierView.vestingSettings.vestingPercentage,
          vestingDuration: tierView.vestingSettings.vestingDuration,
          cliffPeriod: tierView.vestingSettings.cliffPeriod,
          unlockStep: tierView.vestingSettings.unlockStep,
        },
      };
    };

    const tierViewsToObject = (tierViews) => {
      return tierViews.map((tierView) => tierViewToObject(tierView));
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
              rewardToken: ZERO_ADDR,
              creationReward: 0,
              executionReward: 0,
              voteRewardsCoefficient: 0,
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
              rewardToken: ZERO_ADDR,
              creationReward: 0,
              executionReward: 0,
              voteRewardsCoefficient: 0,
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
              rewardToken: ZERO_ADDR,
              creationReward: 0,
              executionReward: 0,
              voteRewardsCoefficient: 0,
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
              rewardToken: ZERO_ADDR,
              creationReward: 0,
              executionReward: 0,
              voteRewardsCoefficient: 0,
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
        descriptionURL: "example.com",
        name: "Pool name",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();

      await tsp.__TokenSaleProposal_init(govPool.address);

      erc20Params = {
        govAddress: govPool.address,
        saleAddress: tsp.address,
        constructorParameters: {
          name: "ERC20SaleMocked",
          symbol: "ERC20SM",
          users: [SECOND, THIRD],
          saleAmount: wei(1000),
          cap: wei(2000),
          mintedTotal: wei(1010),
          amounts: [wei(2), wei(3)],
        },
      };

      erc20Sale = await ERC20Sale.new(
        erc20Params.govAddress,
        erc20Params.saleAddress,
        erc20Params.constructorParameters
      );

      purchaseToken1 = await ERC20Mock.new("PurchaseMockedToken1", "PMT1", 18);
      purchaseToken2 = await ERC20Mock.new("PurchaseMockedToken1", "PMT1", 18);
      sellToken = await ERC20Mock.new("SellMockedToken", "SMT", 18);

      tiers = [
        {
          metadata: {
            name: "tier 1",
            description: "the first tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: ((await getCurrentBlockTime()) + 100).toString(),
          saleEndTime: ((await getCurrentBlockTime()) + 200).toString(),
          saleTokenAddress: erc20Sale.address,
          purchaseTokenAddresses: [purchaseToken1.address, ETHER_ADDR],
          exchangeRates: [PRECISION.times(3).toFixed(), PRECISION.times(100).toFixed()],
          minAllocationPerUser: wei(20),
          maxAllocationPerUser: wei(600),
          vestingSettings: {
            vestingPercentage: PERCENTAGE_100.idiv(5).toFixed(),
            vestingDuration: "100",
            cliffPeriod: "50",
            unlockStep: "2",
          },
        },
        {
          metadata: {
            name: "tier 2",
            description: "the second tier",
          },
          totalTokenProvided: wei(1000),
          saleStartTime: ((await getCurrentBlockTime()) + 1000).toString(),
          saleEndTime: ((await getCurrentBlockTime()) + 2000).toString(),
          saleTokenAddress: sellToken.address,
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
        },
      ];
    });

    describe("latestTierId", () => {
      it("should be increased when tiers has been created", async () => {
        assert.equal(await tsp.latestTierId(), 0);

        await sellToken.mint(govPool.address, tiers[1].totalTokenProvided);

        await acceptProposal(
          [sellToken.address, tsp.address],
          [0, 0],
          [getBytesTransfer(tsp.address, tiers[1].totalTokenProvided), getBytesCreateTiersTSP(tiers)]
        );

        assert.equal(await tsp.latestTierId(), 2);
      });
    });

    describe("createTiers", () => {
      it("should not create tiers if the caller is not a govPool", async () => {
        await truffleAssert.reverts(tsp.createTiers(tiers), "TSP: not a Gov contract");
      });

      it("should not create tiers if the saleTokenAddress is zero", async () => {
        tiers[0].saleTokenAddress = ZERO_ADDR;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: sale token cannot be zero"
        );
      });

      it("should not create tiers if the saleTokenAddress is the ether address", async () => {
        tiers[0].saleTokenAddress = ETHER_ADDR;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: cannot sale native currency"
        );
      });

      it("should not create tiers if the sale token is not provided", async () => {
        tiers[0].totalTokenProvided = 0;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: sale token is not provided"
        );
      });

      it("should not create tiers if saleStartTime > saleEndTime", async () => {
        tiers[0].saleStartTime = tiers[0].saleEndTime + 1;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: saleEndTime is less than saleStartTime"
        );
      });

      it("should not create tiers if minAllocationPerUser > maxAllocationPerUser", async () => {
        tiers[0].minAllocationPerUser = tiers[0].maxAllocationPerUser + 1;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: wrong allocation"
        );
      });

      it("should not create tiers if vestingPercentage > 100%", async () => {
        tiers[0].vestingSettings.vestingPercentage = toBN(PERCENTAGE_100).plus(1).toFixed();

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if vestingPercentage is not zero and unlockStep is zero", async () => {
        tiers[0].vestingSettings.unlockStep = 0;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if vestingDuration < unlockStep", async () => {
        tiers[0].vestingSettings.vestingDuration = 0;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: vesting settings validation failed"
        );
      });

      it("should not create tiers if no purchaseTokenAddresses provided", async () => {
        tiers[0].purchaseTokenAddresses = [];

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: purchase tokens are not provided"
        );
      });

      it("should not create tiers if purchaseTokenAddresses weren't provided", async () => {
        tiers[0].purchaseTokenAddresses = [];

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: purchase tokens are not provided"
        );
      });

      it("should not create tiers if purchaseTokenAddresses and exchangeRates lengths mismatch", async () => {
        tiers[0].purchaseTokenAddresses = tiers[0].purchaseTokenAddresses.slice(0, 1);

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: tokens and rates lengths mismatch"
        );
      });

      it("should not create tiers if the purchaseTokenAddress is zero", async () => {
        tiers[0].purchaseTokenAddresses[1] = ZERO_ADDR;

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: purchase token cannot be zero"
        );
      });

      it("should not create tiers if purchaseTokenAddresses are duplicated", async () => {
        tiers[0].purchaseTokenAddresses[0] = tiers[0].purchaseTokenAddresses[1];

        await truffleAssert.reverts(
          acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(tiers.slice(0, 1))]),
          "TSP: purchase tokens are duplicated"
        );
      });

      it("should create tiers if all conditions are met", async () => {
        await acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(JSON.parse(JSON.stringify(tiers)))]);

        assert.deepEqual(tierViewsToObject((await tsp.getTiers(0, 2)).tierViews), tiers);
      });
    });

    describe("if tiers created", () => {
      beforeEach(async () => {
        // `getBytesCreateTiersTSP` modifies `tiers`, so it's needed to make a deep copy
        await acceptProposal([tsp.address], [0], [getBytesCreateTiersTSP(JSON.parse(JSON.stringify(tiers)))]);

        await purchaseToken1.mint(OWNER, wei(1000));

        await network.provider.send("hardhat_setBalance", [OWNER, "0x" + wei("100000")]);
      });

      describe("addToWhitelist", () => {
        it("should not whitelist if the tier does not exist", async () => {
          const nonexistentWhitelisting = [
            {
              tierId: 3,
              users: [SECOND],
            },
          ];

          await truffleAssert.reverts(
            acceptProposal([tsp.address], [0], [getBytesAddToWhitelistTSP(nonexistentWhitelisting)]),
            "TSP: tier does not exist"
          );
        });

        it("should not whitelist twice", async () => {
          const doubleWhitelisting = [
            {
              tierId: 1,
              users: [SECOND],
            },
            {
              tierId: 1,
              users: [SECOND],
            },
          ];

          await truffleAssert.reverts(
            acceptProposal([tsp.address], [0], [getBytesAddToWhitelistTSP(doubleWhitelisting)]),
            "TSP: balance can be only 0 or 1"
          );
        });

        it("should not transfer whitelist token", async () => {
          const whitelistingRequest = [
            {
              tierId: 1,
              users: [SECOND],
            },
          ];

          await acceptProposal([tsp.address], [0], [getBytesAddToWhitelistTSP(whitelistingRequest)]);

          await tsp.setApprovalForAll(THIRD, true, { from: SECOND });

          await truffleAssert.reverts(
            tsp.safeTransferFrom(SECOND, THIRD, 1, 1, [], { from: THIRD }),
            "TSP: only for minting"
          );
        });

        it("should whitelist properly if all conditions are met", async () => {
          const whitelistingRequests = [
            {
              tierId: 1,
              users: [SECOND],
            },
            {
              tierId: 2,
              users: [OWNER, THIRD],
            },
          ];

          assert.equal((await tsp.totalSupply(1)).toFixed(), "0");
          assert.equal((await tsp.totalSupply(2)).toFixed(), "0");

          await acceptProposal([tsp.address], [0], [getBytesAddToWhitelistTSP(whitelistingRequests)]);

          assert.equal((await tsp.totalSupply(1)).toFixed(), "1");
          assert.equal((await tsp.totalSupply(2)).toFixed(), "2");

          assert.equal((await tsp.balanceOf(SECOND, 1)).toFixed(), "1");
          assert.equal((await tsp.balanceOf(OWNER, 2)).toFixed(), "1");
          assert.equal((await tsp.balanceOf(THIRD, 2)).toFixed(), "1");
        });
      });

      describe("offTiers", () => {
        it("should not off tiers if the tier does not exist", async () => {
          const nonexistentOffTier = [3];

          await truffleAssert.reverts(
            acceptProposal([tsp.address], [0], [getBytesOffTiersTSP(nonexistentOffTier)]),
            "TSP: tier does not exist"
          );
        });

        it("should not off tiers if the tier is already off", async () => {
          const doubleOffTier = [1, 1];

          await truffleAssert.reverts(
            acceptProposal([tsp.address], [0], [getBytesOffTiersTSP(doubleOffTier)]),
            "TSP: tier is off"
          );
        });

        it("should off tiers if all conditions are met", async () => {
          const offTierIds = [1, 2];

          assert.deepEqual(
            (await tsp.getTiers(0, 2)).tierInfoViews.map((tierInfoView) => tierInfoView.isOff),
            [false, false]
          );

          await acceptProposal([tsp.address], [0], [getBytesOffTiersTSP(offTierIds)]);

          assert.deepEqual(
            (await tsp.getTiers(0, 2)).tierInfoViews.map((tierInfoView) => tierInfoView.isOff),
            [true, true]
          );
        });
      });

      describe("buy", () => {
        it("should buy for erc20 if all conditions are met", async () => {
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), "0");
          assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(1000));

          await purchaseToken1.approve(tsp.address, wei(100));

          await setTime(parseInt(tiers[0].saleStartTime));
          await tsp.buy(1, purchaseToken1.address, wei(100));

          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(240));
          assert.equal((await purchaseToken1.balanceOf(OWNER)).toFixed(), wei(900));
        });

        it("should buy for ether if all conditions are met", async () => {
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), "0");

          await setTime(parseInt(tiers[0].saleStartTime));

          const balanceBefore = await web3.eth.getBalance(OWNER);

          const tx = await tsp.buy(1, ETHER_ADDR, 0, { value: wei(1) });

          assert.equal(
            toBN(balanceBefore)
              .minus(toBN(tx.receipt.gasUsed).times(tx.receipt.effectiveGasPrice))
              .minus(await web3.eth.getBalance(OWNER))
              .toFixed(),
            wei(1)
          );
          assert.equal(await web3.eth.getBalance(govPool.address), wei(1));

          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(80));
        });

        it("should not buy if the tier does not exist", async () => {
          await truffleAssert.reverts(tsp.buy(3, purchaseToken1.address, wei(100)), "TSP: tier does not exist");
        });

        it("should not buy if the tier is off", async () => {
          await acceptProposal([tsp.address], [0], [getBytesOffTiersTSP([1])]);

          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: tier is off");
        });

        it("should not buy if an amount is zero", async () => {
          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, 0), "TSP: zero amount");

          await truffleAssert.reverts(tsp.buy(1, ETHER_ADDR, wei(1)), "TSP: zero amount");
        });

        it("should not buy if not whitelisted", async () => {
          const whitelistRequest = [
            {
              tierId: 1,
              users: [SECOND],
            },
          ];

          await acceptProposal([tsp.address], [0], [getBytesAddToWhitelistTSP(whitelistRequest)]);

          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: not whitelisted");
        });

        it("should not buy unless it's sale time", async () => {
          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: cannot buy now");

          await setTime(parseInt(tiers[0].saleEndTime + 1));

          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: cannot buy now");
        });

        it("should not buy twice", async () => {
          await setTime(parseInt(tiers[0].saleStartTime));

          await purchaseToken1.approve(tsp.address, wei(200));
          await tsp.buy(1, purchaseToken1.address, wei(100));

          await truffleAssert.reverts(tsp.buy(1, purchaseToken1.address, wei(100)), "TSP: cannot buy twice");
          await truffleAssert.reverts(tsp.buy(1, ETHER_ADDR, 0, { value: wei(1) }), "TSP: cannot buy twice");
        });

        it("should not buy if the incorrect purchase token was provided", async () => {
          await setTime(parseInt(tiers[0].saleStartTime));

          await truffleAssert.reverts(tsp.buy(1, purchaseToken2.address, wei(100)), "TSP: incorrect token");
        });

        it("should not buy unless it's a proper allocation", async () => {
          await setTime(parseInt(tiers[0].saleStartTime));

          await truffleAssert.reverts(tsp.buy(1, ETHER_ADDR, 0, { value: wei(100000) }), "TSP: wrong allocation");
        });

        it("should not buy if the sale token ran out", async () => {
          await setTime(parseInt(tiers[0].saleStartTime));

          await purchaseToken1.approve(tsp.address, wei(200));
          await purchaseToken1.approve(tsp.address, wei(200), { from: SECOND });

          await tsp.buy(1, purchaseToken1.address, wei(200));
          await truffleAssert.reverts(
            tsp.buy(1, purchaseToken1.address, wei(200), { from: SECOND }),
            "TSP: insufficient sale token amount"
          );
        });

        it("should not buy if the TSP has insufficient token balance", async () => {
          await setTime(parseInt(tiers[1].saleStartTime));

          await purchaseToken1.approve(tsp.address, wei(200));

          await truffleAssert.reverts(
            tsp.buy(2, purchaseToken1.address, wei(200)),
            "TSP: insufficient contract balance"
          );
        });
      });

      describe("vestingWithdraw", () => {
        it("should return zero vesting withdraw amount if the user has not purchased the sale token", async () => {
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1, 2])).map((amount) => amount.toFixed()),
            ["0", "0"]
          );
        });

        it("should return zero vesting withdraw amount if vesting percentage is zero", async () => {
          sellToken.mint(tsp.address, wei(1000));

          await purchaseToken1.approve(tsp.address, wei(200));

          assert.equal((await sellToken.balanceOf(OWNER)).toFixed(), "0");

          await setTime(parseInt(tiers[1].saleStartTime));
          await tsp.buy(2, purchaseToken1.address, wei(200));

          assert.equal((await sellToken.balanceOf(OWNER)).toFixed(), wei(800));
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [2])).map((amount) => amount.toFixed()),
            ["0"]
          );
        });

        it("should do multiple various time withdraws properly", async () => {
          await purchaseToken1.approve(tsp.address, wei(200));

          assert.equal((await sellToken.balanceOf(OWNER)).toFixed(), "0");

          await setTime(parseInt(tiers[0].saleStartTime));
          await tsp.buy(1, purchaseToken1.address, wei(200));

          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(480));
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            ["0"]
          );
          await tsp.vestingWithdraw([1]);
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(480));

          await setTime(parseInt(tiers[0].saleStartTime) + 25);

          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(480));
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            ["0"]
          );
          await tsp.vestingWithdraw([1]);
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(480));

          await setTime(parseInt(tiers[0].saleStartTime) + 75);

          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            [wei("88.8")]
          ); // tokensPerStep = 2.4, steps = 74 // 2 = 37, vestingWithdraw = 2.4 * 37 = 88.8
          await tsp.vestingWithdraw([1]);
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei("568.8"));
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            ["0"]
          );

          await setTime(parseInt(tiers[0].saleStartTime) + 101);

          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            [wei("31.2")]
          ); // tokensPerStep = 2.4, steps = (100-74) // 2 = 13 vestingWithdraw = 2.4 * 13 = 31.2
          await tsp.vestingWithdraw([1]);
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei("600"));
          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            ["0"]
          );

          await setTime(parseInt(tiers[0].saleStartTime) + 1001);

          assert.deepEqual(
            (await tsp.getVestingWithdrawAmounts(OWNER, [1])).map((amount) => amount.toFixed()),
            ["0"]
          );
          await tsp.vestingWithdraw([1]);
          assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(600));
        });
      });

      describe("recover", () => {});
    });
  });
});
