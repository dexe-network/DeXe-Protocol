const { toBN, accounts, wei } = require("../../../scripts/utils/utils");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("../../helpers/block-helper");
const { impersonate } = require("../../helpers/impersonator");
const { getBytesApprove, getBytesDistributionProposal } = require("../../utils/gov-pool-utils");
const { ZERO_ADDR, ETHER_ADDR, PRECISION } = require("../../../scripts/utils/constants");
const { DEFAULT_CORE_PROPERTIES } = require("../../utils/constants");
const { assert } = require("chai");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposalMock");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC721Expert = artifacts.require("ERC721Expert");
const LinearPower = artifacts.require("LinearPower");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
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
const GovValidatorsCreateLib = artifacts.require("GovValidatorsCreate");
const GovValidatorsVoteLib = artifacts.require("GovValidatorsVote");
const GovValidatorsExecuteLib = artifacts.require("GovValidatorsExecute");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC721Expert.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";

describe("DistributionProposal", () => {
  let OWNER;
  let SECOND;
  let THIRD;
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

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(4);
    NOTHING = await accounts(9);

    const govUserKeeperViewLib = await GovUserKeeperViewLib.new();

    await GovUserKeeper.link(govUserKeeperViewLib);

    const govPoolCreateLib = await GovPoolCreateLib.new();
    const govPoolExecuteLib = await GovPoolExecuteLib.new();
    const govPoolMicropoolLib = await GovPoolMicropoolLib.new();
    const govPoolRewardsLib = await GovPoolRewardsLib.new();
    const govPoolUnlockLib = await GovPoolUnlockLib.new();
    const govPoolVoteLib = await GovPoolVoteLib.new();
    const govPoolViewLib = await GovPoolViewLib.new();
    const govPoolCreditLib = await GovPoolCreditLib.new();
    const govPoolOffchainLib = await GovPoolOffchainLib.new();

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolMicropoolLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
    await GovPool.link(govPoolCreditLib);
    await GovPool.link(govPoolOffchainLib);

    const govValidatorsCreateLib = await GovValidatorsCreateLib.new();
    const govValidatorsVoteLib = await GovValidatorsVoteLib.new();
    const govValidatorsExecuteLib = await GovValidatorsExecuteLib.new();

    await GovValidators.link(govValidatorsCreateLib);
    await GovValidators.link(govValidatorsVoteLib);
    await GovValidators.link(govValidatorsExecuteLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    const _dexeExpertNft = await ERC721Expert.new();
    const BABT = await BABTMock.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), _dexeExpertNft.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), BABT.address);

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
    expertNft = await ERC721Expert.new();
    nftMultiplier = await ERC721Multiplier.new();
    let linearPower = await LinearPower.new();
    govPool = await GovPool.new();

    await settings.__GovSettings_init(
      govPool.address,
      validators.address,
      userKeeper.address,
      poolParams.settingsParams.proposalSettings,
      [...poolParams.settingsParams.additionalProposalExecutors, dp.address]
    );

    await validators.__GovValidators_init(
      poolParams.validatorsParams.name,
      poolParams.validatorsParams.symbol,
      [
        poolParams.validatorsParams.proposalSettings.duration,
        poolParams.validatorsParams.proposalSettings.executionDelay,
        poolParams.validatorsParams.proposalSettings.quorum,
      ],
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
    await expertNft.__ERC721Expert_init("Mock Expert Nft", "MCKEXPNFT");
    await nftMultiplier.__ERC721Multiplier_init("Mock Nft Multiplier", "MCKNFTMLTPLR");
    await govPool.__GovPool_init(
      [
        settings.address,
        userKeeper.address,
        validators.address,
        expertNft.address,
        nftMultiplier.address,
        linearPower.address,
      ],
      OWNER,
      poolParams.onlyBABTHolders,
      poolParams.deployerBABTid,
      poolParams.descriptionURL,
      poolParams.name
    );

    await settings.transferOwnership(govPool.address);
    await validators.transferOwnership(govPool.address);
    await userKeeper.transferOwnership(govPool.address);
    await expertNft.transferOwnership(govPool.address);
    await nftMultiplier.transferOwnership(govPool.address);

    await poolRegistry.addProxyPool(NAME, govPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);
  }

  async function setupTokens() {
    await token.mint(OWNER, wei("100000000000"));
    await token.approve(userKeeper.address, wei("10000000000"));

    for (let i = 1; i < 10; i++) {
      await nft.mint(OWNER, i);
      await nft.approve(userKeeper.address, i);
    }
  }

  describe("Bad DP", () => {
    it("should revert if _govAddress is zero", async () => {
      dp = await DistributionProposal.new();

      await truffleAssert.reverts(dp.__DistributionProposal_init(ZERO_ADDR), "DP: _govAddress is zero");
    });
  });

  describe("DP", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
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
              minVotesForCreating: wei("3"),
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
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("2"),
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
              delegatedVotingAllowed: true,
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("2"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteRewardsCoefficient: 0,
              },
              executorDescription: "validators",
            },
            {
              earlyCompletion: false,
              delegatedVotingAllowed: true,
              validatorsVote: false,
              duration: 700,
              durationValidators: 800,
              quorum: PRECISION.times("71").toFixed(),
              quorumValidators: PRECISION.times("100").toFixed(),
              minVotesForVoting: wei("20"),
              minVotesForCreating: wei("3"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteRewardsCoefficient: 0,
              },
              executorDescription: "DP",
            },
          ],
          additionalProposalExecutors: [],
        },
        validatorsParams: {
          name: "Validator Token",
          symbol: "VT",
          proposalSettings: {
            duration: 600,
            executionDelay: 0,
            quorum: PRECISION.times("51").toFixed(),
          },
          validators: [OWNER, SECOND],
          balances: [wei("100"), wei("1000000000000")],
        },
        userKeeperParams: {
          tokenAddress: ZERO_ADDR,
          nftAddress: nft.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        regularVoteModifier: wei("1", 25),
        expertVoteModifier: wei("1", 25),
        onlyBABTHolders: false,
        deployerBABTid: 1,
        descriptionURL: "example.com",
        name: "Pool name",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    describe("constructor", () => {
      it("should set parameter correctly", async () => {
        assert.equal(await dp.govAddress(), govPool.address);
      });
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          dp.__DistributionProposal_init(govPool.address),
          "Initializable: contract is already initialized"
        );
      });
    });

    describe("create DP", () => {
      it("should not create DP if proposal id is frontrun", async () => {
        startTime = await getCurrentBlockTime();

        await truffleAssert.reverts(
          govPool.createProposal(
            "example.com",
            [
              [token.address, 0, getBytesApprove(dp.address, wei("100"))],
              [dp.address, 0, getBytesDistributionProposal(2, token.address, wei("100"))],
            ],
            []
          ),
          "Gov: validation failed"
        );
      });
    });

    describe("execute()", () => {
      let startTime;

      describe("refund execute()", () => {
        beforeEach(async () => {
          await token.mint(govPool.address, wei("100"));
          await web3.eth.sendTransaction({ to: govPool.address, value: wei("1"), from: OWNER });

          await nft.transferFrom(OWNER, SECOND, 9);

          await nft.setApprovalForAll(userKeeper.address, true);
          await nft.setApprovalForAll(userKeeper.address, true, { from: SECOND });

          await govPool.deposit(0, [1, 2, 3, 4, 5, 6, 7, 8]);
          await govPool.deposit(0, [9], { from: SECOND });
        });

        it("should refund ERC20", async () => {
          startTime = await getCurrentBlockTime();

          await setTime(startTime + 999);

          await govPool.createProposal(
            "example.com",
            [
              [token.address, 0, getBytesApprove(dp.address, wei("100"))],
              [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100"))],
            ],
            []
          );

          await govPool.vote(1, false, 0, [9], { from: SECOND });
          await govPool.vote(1, true, 0, [1, 2, 3, 4, 5, 6, 7, 8]);

          await setTime(startTime + 10000);

          await govPool.execute(1);

          assert.equal(toBN(await token.balanceOf(govPool.address)).toFixed(), "11111111111111111112");
          assert.equal(toBN(await dp.getPotentialReward(1, OWNER)).toFixed(), "88888888888888888888");
        });

        it("should refund ether", async () => {
          startTime = await getCurrentBlockTime();

          await setTime(startTime + 999);

          await govPool.createProposal(
            "example.com",
            [[dp.address, wei("1"), getBytesDistributionProposal(1, ETHER_ADDR, wei("1"))]],
            []
          );

          await govPool.vote(1, false, 0, [9], { from: SECOND });
          await govPool.vote(1, true, 0, [1, 2, 3, 4, 5, 6, 7, 8]);

          await setTime(startTime + 10000);

          await govPool.execute(1);

          assert.equal(await web3.eth.getBalance(govPool.address), "111111111111111112");
          assert.equal(toBN(await dp.getPotentialReward(1, OWNER)).toFixed(), "888888888888888888");
        });

        it("should not refund ether", async () => {
          await web3.eth.sendTransaction({ to: dp.address, value: wei("1"), from: OWNER });

          await dp.setGovPool(dp.address);
          await dp.setRevertReceive(true);

          await impersonate(dp.address);

          await truffleAssert.reverts(
            dp.execute(1, ETHER_ADDR, wei("1"), { value: wei("1"), from: dp.address }),
            "DP: failed to send back eth"
          );
        });
      });

      describe("execute()", () => {
        beforeEach(async () => {
          startTime = await getCurrentBlockTime();

          await token.mint(govPool.address, wei("100"));

          await govPool.deposit(0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

          await setTime(startTime + 999);

          await govPool.createProposal(
            "example.com",
            [
              [token.address, 0, getBytesApprove(dp.address, wei("100"))],
              [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100"))],
            ],
            []
          );

          await govPool.vote(1, true, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

          await setTime(startTime + 10000);
        });

        it("should correctly execute", async () => {
          await govPool.execute(1);

          assert.equal((await dp.proposals(1)).rewardAddress, token.address);
          assert.equal((await dp.proposals(1)).rewardAmount, wei("100"));
        });

        it("should revert if not a Gov contract", async () => {
          await truffleAssert.reverts(dp.execute(1, token.address, wei("100")), "DP: not a Gov contract");
        });

        it("should revert when try execute existed proposal", async () => {
          await impersonate(govPool.address);

          await govPool.execute(1);

          await truffleAssert.reverts(
            dp.execute(1, token.address, wei("100"), { from: govPool.address }),
            "DP: proposal already exists"
          );
        });

        it("should revert when address is zero", async () => {
          await impersonate(govPool.address);

          await truffleAssert.reverts(
            dp.execute(1, ZERO_ADDR, wei("100"), { from: govPool.address }),
            "DP: zero address"
          );
        });

        it("should revert when amount is zero", async () => {
          await impersonate(govPool.address);

          await truffleAssert.reverts(dp.execute(1, token.address, "0", { from: govPool.address }), "DP: zero amount");
        });

        it("should revert if not enough ether", async () => {
          await govPool.createProposal(
            "example.com",
            [[dp.address, 0, getBytesDistributionProposal(2, ETHER_ADDR, wei("1"))]],
            []
          );

          await govPool.vote(2, true, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

          await setTime(startTime + 20000);

          await truffleAssert.reverts(govPool.execute(2), "DP: wrong native amount");
        });
      });
    });

    describe("claim()", () => {
      let startTime;

      const SINGLE_NFT_POWER = toBN(wei(33000));

      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();

        for (let i = 1; i <= 9; i++) {
          await nft.transferFrom(OWNER, i <= 5 ? SECOND : THIRD, i);
        }

        await nft.setApprovalForAll(userKeeper.address, true, { from: SECOND });
        await nft.setApprovalForAll(userKeeper.address, true, { from: THIRD });

        await govPool.deposit(0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.deposit(0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 999);

        await token.mint(govPool.address, wei("100000"));
        await web3.eth.sendTransaction({ from: OWNER, to: govPool.address, value: wei("10") });
      });

      it("should not claim wrong proposal", async () => {
        assert.equal(await dp.getPotentialReward(1, OWNER), 0);
      });

      it("should not claim if insufficient funds", async () => {
        await govPool.createProposal(
          "example.com",
          [
            [token.address, 0, getBytesApprove(dp.address, wei("100000"))],
            [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100000"))],
          ],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, true, 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 10000);

        await govPool.execute(1);

        await token.burn(dp.address, wei("100000"));

        await truffleAssert.reverts(dp.claim(SECOND, [1]), "Insufficient funds");
      });

      it("should correctly claim", async () => {
        await govPool.createProposal(
          "example.com",
          [
            [token.address, 0, getBytesApprove(dp.address, wei("100000"))],
            [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100000"))],
          ],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, true, 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 10000);
        await govPool.execute(1);

        assert.isFalse(await dp.isClaimed(1, SECOND));

        await dp.claim(SECOND, [1]);
        await dp.claim(THIRD, [1]);

        assert.isTrue(await dp.isClaimed(1, SECOND));
        assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
        assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
      });

      it("should correctly claim ether", async () => {
        const FOUR_NFT_VOTES = SINGLE_NFT_POWER.times(4).dividedBy(9).integerValue();
        const FIVE_NFT_VOTES = SINGLE_NFT_POWER.times(5).dividedBy(9).integerValue();
        const ALL_NFT_VOTES = FIVE_NFT_VOTES.plus(FOUR_NFT_VOTES);

        async function dpClaim(user, proposals) {
          let balanceBefore = toBN(await web3.eth.getBalance(user));

          await dp.claim(user, proposals);

          let balanceAfter = toBN(await web3.eth.getBalance(user));
          let diff = balanceAfter.minus(balanceBefore);

          return diff.toFixed();
        }

        await govPool.createProposal(
          "example.com",
          [[dp.address, wei("1"), getBytesDistributionProposal(1, ETHER_ADDR, wei("1"))]],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, true, 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 10000);
        await govPool.execute(1);

        let reward = await dpClaim(SECOND, [1]);

        assert.equal(reward, toBN(wei(1)).times(FIVE_NFT_VOTES).idiv(ALL_NFT_VOTES).toFixed());

        reward = await dpClaim(THIRD, [1]);

        assert.equal(reward, toBN(wei(1)).times(FOUR_NFT_VOTES).idiv(ALL_NFT_VOTES).toFixed());
      });

      it("should not claim if vote against", async () => {
        await govPool.createProposal(
          "example.com",
          [
            [token.address, 0, getBytesApprove(dp.address, wei("100000"))],
            [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100000"))],
          ],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, false, 0, [2, 3, 4, 5], { from: SECOND });

        assert.equal(await dp.getPotentialReward(1, SECOND), 0);
      });

      it("should not claim if canceled votes", async () => {
        await govPool.createProposal(
          "example.com",
          [
            [token.address, 0, getBytesApprove(dp.address, wei("100000"))],
            [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100000"))],
          ],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [6, 7, 9], { from: THIRD });
        await govPool.vote(1, true, 0, [2, 3, 4, 5], { from: SECOND });
        await govPool.cancelVote(1, { from: SECOND });

        assert.equal(await dp.getPotentialReward(1, SECOND), 0);
      });

      it("should correctly calculate reward", async () => {
        const ONE_NFT_VOTE = SINGLE_NFT_POWER.dividedBy(9).integerValue();
        const THREE_NFT_VOTES = SINGLE_NFT_POWER.times(3).dividedBy(9).integerValue();
        const FOUR_NFT_VOTES = SINGLE_NFT_POWER.times(4).dividedBy(9).integerValue();
        const ALL_NFT_VOTES = THREE_NFT_VOTES.plus(FOUR_NFT_VOTES).plus(ONE_NFT_VOTE.times(2));

        await govPool.createProposal(
          "example.com",
          [[dp.address, wei("1"), getBytesDistributionProposal(1, ETHER_ADDR, wei("1"))]],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, false, 0, [6, 7, 9], { from: THIRD });

        await setTime(startTime + 10000);
        await govPool.execute(1);

        assert.closeTo(
          (await dp.getPotentialReward(1, SECOND)).toNumber(),
          toBN(wei(1)).times(FOUR_NFT_VOTES.plus(ONE_NFT_VOTE)).idiv(ALL_NFT_VOTES.minus(ONE_NFT_VOTE)).toNumber(),
          10
        );
        assert.equal(await dp.getPotentialReward(1, THIRD), 0);
      });

      it("should revert if already claimed", async () => {
        await govPool.createProposal(
          "example.com",
          [
            [token.address, 0, getBytesApprove(dp.address, wei("100000"))],
            [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100000"))],
          ],
          [],
          { from: SECOND }
        );

        await govPool.vote(1, true, 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, true, 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 10000);
        await govPool.execute(1);

        await dp.claim(SECOND, [1]);

        await truffleAssert.reverts(dp.claim(SECOND, [1]), "DP: already claimed");
      });

      it("should revert if distribution isn't start yet", async () => {
        await truffleAssert.reverts(dp.claim(SECOND, [1]), "DP: zero address");
      });

      it("should revert when array length is zero", async () => {
        await truffleAssert.reverts(dp.claim(SECOND, []), "DP: zero array length");
      });

      it("should revert when address is zero", async () => {
        await truffleAssert.reverts(dp.claim(ZERO_ADDR, [1]), "DP: zero address");
      });
    });
  });
});
