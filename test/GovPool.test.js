const { toBN, accounts, wei } = require("../scripts/utils/utils");
const {
  getBytesExecute,
  getBytesEditUrl,
  getBytesAddSettings,
  getBytesEditSettings,
  getBytesChangeExecutors,
  getBytesChangeBalances,
  getBytesSetERC20Address,
  getBytesSetERC721Address,
  getBytesDistributionProposal,
  getBytesApprove,
  getBytesApproveAll,
  getBytesSetNftMultiplierAddress,
} = require("./utils/gov-pool-utils");
const { ZERO_ADDR, ETHER_ADDR, PRECISION } = require("../scripts/utils/constants");
const { ProposalState, DEFAULT_CORE_PROPERTIES } = require("./utils/constants");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/block-helper");
const { impersonate } = require("./helpers/impersonator");
const { assert } = require("chai");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const GovValidators = artifacts.require("GovValidators");
const GovSettings = artifacts.require("GovSettings");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const ERC20Mock = artifacts.require("ERC20Mock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ExecutorTransferMock.numberFormat = "BigNumber";

describe("GovPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FOURTH;
  let FACTORY;
  let NOTHING;

  let contractsRegistry;
  let coreProperties;
  let poolRegistry;

  let token;
  let nft;
  let rewardToken;
  let nftMultiplier;

  let settings;
  let validators;
  let userKeeper;
  let dp;
  let govPool;

  const getProposalByIndex = async (index) => (await govPool.getProposals(index - 1, 1))[0].proposal;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FOURTH = await accounts(3);
    FACTORY = await accounts(4);
    NOTHING = await accounts(9);

    const govPoolCreateLib = await GovPoolCreateLib.new();
    const govPoolExecuteLib = await GovPoolExecuteLib.new();
    const govPoolRewardsLib = await GovPoolRewardsLib.new();
    const govPoolUnlockLib = await GovPoolUnlockLib.new();
    const govPoolVoteLib = await GovPoolVoteLib.new();
    const govPoolViewLib = await GovPoolViewLib.new();

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
  });

  beforeEach("setup", async () => {
    contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");
    nftMultiplier = await ERC721Multiplier.new("NFTMultiplierMock", "NFTMM");
    rewardToken = await ERC20Mock.new("REWARD", "RWD", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), ETHER_ADDR);
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

    for (let i = 1; i < 10; i++) {
      await nft.safeMint(OWNER, i);
      await nft.approve(userKeeper.address, i);
    }

    await rewardToken.mint(govPool.address, wei("10000000000000000000000"));
  }

  async function setNftMultiplierAddress(addr) {
    const bytesSetAddress = getBytesSetNftMultiplierAddress(addr);

    await govPool.createProposal("example.com", [govPool.address], [0], [bytesSetAddress]);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, 0, [], wei("1000"), []);
    await govPool.vote(proposalId, 0, [], wei("100000000000000000000"), [], { from: SECOND });

    await govPool.moveProposalToValidators(proposalId);
    await validators.vote(proposalId, wei("100"), false);
    await validators.vote(proposalId, wei("1000000000000"), false, { from: SECOND });

    await govPool.execute(proposalId);
  }

  describe("Fullfat GovPool", () => {
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
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
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
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
              executorDescription: "internal",
            },
            {
              earlyCompletion: false,
              delegatedVotingAllowed: false,
              validatorsVote: true,
              duration: 600,
              durationValidators: 800,
              quorum: PRECISION.times("71").toFixed(),
              quorumValidators: PRECISION.times("100").toFixed(),
              minVotesForVoting: wei("20"),
              minVotesForCreating: wei("3"),
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
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
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
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
          nftAddress: nft.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        nftMultiplierAddress: ZERO_ADDR,
        descriptionURL: "example.com",
        name: "Pool name",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    describe("init()", () => {
      it("should correctly set all parameters", async () => {
        const contracts = await govPool.getHelperContracts();

        assert.equal(contracts.settings, settings.address);
        assert.equal(contracts.userKeeper, userKeeper.address);
        assert.equal(contracts.validators, validators.address);
        assert.equal(contracts.distributionProposal, dp.address);
      });
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          govPool.__GovPool_init(
            settings.address,
            userKeeper.address,
            dp.address,
            validators.address,
            POOL_PARAMETERS.nftMultiplierAddress,
            POOL_PARAMETERS.descriptionURL,
            POOL_PARAMETERS.name
          ),
          "Initializable: contract is already initialized"
        );
      });

      it("should not set dependencies from non dependant", async () => {
        await truffleAssert.reverts(govPool.setDependencies(OWNER), "Dependant: Not an injector");
      });
    });

    describe("deposit()", () => {
      it("should deposit tokens", async () => {
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).totalBalance.toFixed(), wei("100000000000"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).ownedBalance.toFixed(), wei("100000000000"));

        assert.equal((await userKeeper.nftBalance(OWNER, false, false)).totalBalance.toFixed(), "9");
        assert.equal((await userKeeper.nftBalance(OWNER, false, false)).ownedBalance.toFixed(), "9");

        await govPool.deposit(OWNER, wei("100"), [1, 2, 3]);

        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).totalBalance.toFixed(), wei("100000000000"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).ownedBalance.toFixed(), wei("99999999900"));

        assert.equal((await userKeeper.nftBalance(OWNER, false, false)).totalBalance.toFixed(), "9");
        assert.equal((await userKeeper.nftBalance(OWNER, false, false)).ownedBalance.toFixed(), "6");
      });
    });

    describe("unlockInProposals(), unlock()", () => {
      let startTime;

      beforeEach("setup", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);

        startTime = await getCurrentBlockTime();

        await govPool.vote(1, 0, [], wei("100"), [2]);
        await govPool.vote(2, 0, [], wei("50"), []);
      });

      it("should unlock in first proposal", async () => {
        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(beforeUnlock.tokens.toFixed(), wei("900"));
        assert.deepEqual(beforeUnlock.nfts[0].slice(0, beforeUnlock.nfts[1]), ["1", "3", "4"]);

        await setTime(startTime + 1000);
        await govPool.unlockInProposals([1], OWNER, false);

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(afterUnlock.tokens.toFixed(), wei("1000"));
        assert.deepEqual(afterUnlock.nfts[0].slice(0, afterUnlock.nfts[1]), ["1", "2", "3", "4"]);
      });

      it("should unlock all", async () => {
        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(beforeUnlock.tokens.toFixed(), wei("900"));
        assert.deepEqual(beforeUnlock.nfts[0].slice(0, beforeUnlock.nfts[1]), ["1", "3", "4"]);

        await setTime(startTime + 1000);
        await govPool.unlock(OWNER, false);

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(afterUnlock.tokens.toFixed(), wei("1000"));
        assert.deepEqual(afterUnlock.nfts[0].slice(0, afterUnlock.nfts[1]), ["1", "2", "3", "4"]);
      });
    });

    describe("createProposal()", () => {
      beforeEach("", async () => {
        await govPool.deposit(OWNER, 1, [1]);
      });

      it("should create 2 proposals", async () => {
        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        let proposal = await getProposalByIndex(1);
        let defaultSettings = POOL_PARAMETERS.settingsParams.proposalSettings[0];

        assert.equal(proposal.core.settings[0], defaultSettings.earlyCompletion);
        assert.equal(proposal.core.settings[1], defaultSettings.delegatedVotingAllowed);
        assert.equal(proposal.core.settings[2], defaultSettings.validatorsVote);
        assert.equal(proposal.core.settings[3], defaultSettings.duration);
        assert.equal(proposal.core.settings[4], defaultSettings.durationValidators);
        assert.equal(proposal.core.settings[5], defaultSettings.quorum);
        assert.equal(proposal.core.settings[6], defaultSettings.quorumValidators);
        assert.equal(proposal.core.settings[7], defaultSettings.minVotesForVoting);
        assert.equal(proposal.core.settings[8], defaultSettings.minVotesForCreating);

        assert.isFalse(proposal.core.executed);
        assert.equal(proposal.descriptionURL, "example.com");
        assert.deepEqual(proposal.data, [getBytesApprove(SECOND, 1)]);

        await govPool.createProposal("example2.com", [THIRD], [0], [getBytesApprove(SECOND, 2)]);
        proposal = await getProposalByIndex(2);

        assert.equal(proposal.core.settings[0], defaultSettings.earlyCompletion);
        assert.equal(proposal.core.settings[1], defaultSettings.delegatedVotingAllowed);
        assert.equal(proposal.core.settings[2], defaultSettings.validatorsVote);
        assert.equal(proposal.core.settings[3], defaultSettings.duration);
        assert.equal(proposal.core.settings[4], defaultSettings.durationValidators);
        assert.equal(proposal.core.settings[5], defaultSettings.quorum);
        assert.equal(proposal.core.settings[6], defaultSettings.quorumValidators);
        assert.equal(proposal.core.settings[7], defaultSettings.minVotesForVoting);
        assert.equal(proposal.core.settings[8], defaultSettings.minVotesForCreating);

        assert.isFalse(proposal.core.executed);
        assert.equal(proposal.descriptionURL, "example2.com");
        assert.deepEqual(proposal.data, [getBytesApprove(SECOND, 2)]);
      });

      it("should not create proposal due to low voting power", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", [SECOND], [0], [getBytesApprove(SECOND, 1)], { from: SECOND }),
          "Gov: low creating power"
        );
      });

      it("should revert when creating proposal with arrays zero length", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", [], [0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
        await truffleAssert.reverts(
          govPool.createProposal("", [SECOND], [0, 0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
        await truffleAssert.reverts(
          govPool.createProposal("", [SECOND, THIRD], [0, 0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
      });

      describe("validators", () => {
        it("should not create validators proposal if executors > 1", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [settings.address, validators.address],
              [0, 0],
              [
                getBytesAddSettings([POOL_PARAMETERS.settingsParams.proposalSettings[2]]),
                getBytesChangeBalances([wei("10")], [THIRD]),
              ]
            ),
            "Gov: invalid executors length"
          );
        });

        it("should revert when creating validator proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [validators.address],
              [1],
              [getBytesChangeBalances([wei("10")], [THIRD])]
            ),
            "Gov: invalid internal data"
          );
        });
      });

      describe("DP", () => {
        it("should revert when creating DP proposal with wrong proposal id", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [dp.address],
              [0],
              [getBytesDistributionProposal(2, token.address, wei("100"))]
            ),
            "Gov: invalid proposalId"
          );
        });

        it("should revert when creating DP proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [token.address, dp.address],
              [1, 0],
              [getBytesApprove(dp.address, wei("100")), getBytesDistributionProposal(1, token.address, wei("100"))]
            ),
            "Gov: invalid internal data"
          );
        });
      });

      describe("internal", () => {
        it("should create multi internal proposal", async () => {
          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              [settings.address, userKeeper.address, userKeeper.address],
              [0, 0, 0],
              [
                getBytesAddSettings([POOL_PARAMETERS.settingsParams.proposalSettings[2]]),
                getBytesSetERC20Address(token.address),
                getBytesSetERC721Address(token.address, wei("1"), 1),
              ]
            ),
            "pass"
          );
        });

        it("should revert when creating internal proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [settings.address],
              [1],
              [getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.proposalSettings[0]])]
            ),
            "Gov: invalid internal data"
          );

          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              [settings.address],
              [0],
              [getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.proposalSettings[0]])]
            ),
            "Created"
          );
        });
      });

      describe("existing", () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          validatorsVote: false,
          duration: 70,
          durationValidators: 800,
          quorum: PRECISION.times("1").toFixed(),
          quorumValidators: PRECISION.times("1").toFixed(),
          minVotesForVoting: 0,
          minVotesForCreating: 0,
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        beforeEach("setup", async () => {
          await govPool.createProposal(
            "example.com",
            [settings.address, settings.address],
            [0, 0],
            [getBytesAddSettings([NEW_SETTINGS]), getBytesChangeExecutors([THIRD], [4])]
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.vote(1, wei("1000"), [], wei("1000"), []);
          await govPool.vote(1, wei("100000000000000000000"), [], wei("100000000000000000000"), [], {
            from: SECOND,
          });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);
        });

        it("should create trusted proposal", async () => {
          await govPool.createProposal(
            "example.com",
            [THIRD, THIRD],
            [0, 0],
            [getBytesApprove(OWNER, 1), getBytesApproveAll(OWNER, true)]
          );

          const proposal = await getProposalByIndex(2);

          assert.equal(toBN(proposal.core.settings.quorum).toFixed(), NEW_SETTINGS.quorum);
        });

        it("should create default proposal", async () => {
          await govPool.createProposal(
            "example.com",
            [THIRD, THIRD],
            [0, 0],
            [getBytesAddSettings([NEW_SETTINGS]), getBytesAddSettings([NEW_SETTINGS])]
          );

          const proposal = await getProposalByIndex(2);

          assert.equal(
            toBN(proposal.core.settings.quorum).toFixed(),
            POOL_PARAMETERS.settingsParams.proposalSettings[0].quorum
          );
        });
      });
    });

    describe("voting", () => {
      beforeEach("setup", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
      });

      describe("vote() tokens", () => {
        it("should vote for two proposals", async () => {
          await govPool.vote(1, 0, [], wei("100"), []);
          await govPool.vote(2, 0, [], wei("50"), []);

          assert.equal((await getProposalByIndex(1)).descriptionURL, "example.com");
          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("100"));
          assert.equal((await getProposalByIndex(2)).core.votesFor, wei("50"));

          const voteInfo = await govPool.getUserVotes(1, OWNER, false);

          assert.equal(voteInfo.totalVoted, wei("100"));
          assert.equal(voteInfo.tokensVoted, wei("100"));
          assert.deepEqual(voteInfo.nftsVoted, []);
        });

        it("should not vote if votes limit is reached", async () => {
          await coreProperties.setGovVotesLimit(0);

          await truffleAssert.reverts(govPool.vote(1, 0, [], wei("100"), []), "Gov: vote limit reached");
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("100"));

          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("200"));
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], 0, []), "Gov: empty vote");
        });
      });

      describe("voteDelegated() tokens", () => {
        beforeEach("setup", async () => {
          await govPool.delegate(SECOND, wei("500"), []);
          await govPool.delegate(THIRD, wei("500"), []);
        });

        it("should vote delegated tokens for two proposals", async () => {
          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          await govPool.voteDelegated(2, wei("50"), [], { from: THIRD });

          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("100"));
          assert.equal((await getProposalByIndex(2)).core.votesFor, wei("50"));

          const voteInfo = await govPool.getUserVotes(1, SECOND, true);

          assert.equal(voteInfo.totalVoted, wei("100"));
          assert.equal(voteInfo.tokensVoted, wei("100"));
          assert.deepEqual(voteInfo.nftsVoted, []);
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("100"));

          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("200"));

          const total = await govPool.getTotalVotes(1, SECOND, true);

          assert.equal(toBN(total[0]).toFixed(), wei("200"));
          assert.equal(toBN(total[1]).toFixed(), wei("200"));
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegated(1, wei("500"), [], { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("500"));
        });

        it("should revert when vote is zero amount", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [], { from: SECOND }), "Gov: empty delegated vote");
        });

        it("should revert when spending undelegated tokens", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 1, [], { from: FOURTH }), "Gov: low voting power");
        });

        it("should revert if voting with amount exceeding delegation", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegated(1, wei("1000"), [], { from: SECOND }),
            "Gov: wrong vote amount"
          );
        });
      });

      describe("vote() nfts", () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");

        it("should vote for two proposals", async () => {
          await govPool.vote(1, 0, [], 0, [1]);
          await govPool.vote(2, 0, [], 0, [2, 3]);

          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await getProposalByIndex(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());

          const voteInfo = await govPool.getUserVotes(1, OWNER, false);

          assert.equal(voteInfo.totalVoted, SINGLE_NFT_COST.toFixed());
          assert.equal(voteInfo.tokensVoted, "0");
          assert.deepEqual(voteInfo.nftsVoted, ["1"]);
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], 0, [1]);
          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.vote(1, 0, [], 0, [2, 3]);
          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.times(3).plus(1).toFixed());
        });

        it("should revert when voting with same NFTs", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], 0, [2, 2]), "Gov: NFT already voted");
        });
      });

      describe("voteDelegated() nfts", () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");

        beforeEach("setup", async () => {
          await govPool.delegate(SECOND, wei("500"), [1]);
          await govPool.delegate(THIRD, wei("500"), [2, 3]);
        });

        it("should vote delegated nfts for two proposals", async () => {
          await govPool.voteDelegated(1, 0, [1], { from: SECOND });
          await govPool.voteDelegated(2, 0, [2, 3], { from: THIRD });

          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await getProposalByIndex(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());

          const voteInfo = await govPool.getUserVotes(1, SECOND, true);

          assert.equal(voteInfo.totalVoted, SINGLE_NFT_COST.toFixed());
          assert.equal(voteInfo.tokensVoted, "0");
          assert.deepEqual(voteInfo.nftsVoted, ["1"]);
        });

        it("should vote delegated nfts twice", async () => {
          await govPool.voteDelegated(1, 0, [2], { from: THIRD });
          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.voteDelegated(1, 0, [3], { from: THIRD });
          assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.times(2).toFixed());
        });

        it("should revert when spending undelegated nfts", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [1], { from: FOURTH }), "Gov: low voting power");
        });

        it("should revert when voting with not delegated nfts", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [2], { from: SECOND }), "GovUK: NFT is not owned");
        });
      });

      describe("moveProposalToValidators()", () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 70,
          durationValidators: 800,
          quorum: PRECISION.times("71").toFixed(),
          quorumValidators: PRECISION.times("100").toFixed(),
          minVotesForVoting: wei("20"),
          minVotesForCreating: wei("3"),
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        beforeEach("setup", async () => {
          startTime = await getCurrentBlockTime();

          await govPool.createProposal(
            "example.com",
            [settings.address],
            [0],
            [getBytesEditSettings([3], [NEW_SETTINGS])]
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
        });

        it("should move proposal to validators", async () => {
          await govPool.vote(3, wei("1000"), [], wei("1000"), []);
          await govPool.vote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], { from: SECOND });

          const proposal = await getProposalByIndex(3);

          await govPool.moveProposalToValidators(3);

          const afterMove = await validators.getExternalProposal(3);

          assert.equal(await govPool.getProposalState(3), ProposalState.ValidatorVoting);

          assert.equal(proposal.core.executed, afterMove.core.executed);
          assert.equal(proposal.core.settings.quorumValidators, afterMove.core.quorum);

          await validators.vote(3, wei("1000000000000"), false, { from: SECOND });

          assert.equal(await govPool.getProposalState(3), ProposalState.Succeeded);
        });

        it("should be rejected by validators", async () => {
          await govPool.vote(3, wei("1000"), [], wei("1000"), []);
          await govPool.vote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(3);

          await setTime(startTime + 1000000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
        });

        it("should revert when try move without vote", async () => {
          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
        });
      });
    });

    describe("deposit, vote, withdraw", () => {
      it("should deposit, vote and withdraw tokens", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await token.mint(SECOND, wei("1000"));
        await token.approve(userKeeper.address, wei("1000"), { from: SECOND });

        await govPool.vote(1, wei("1000"), [], wei("500"), [], { from: SECOND });

        let withdrawable = await govPool.getWithdrawableAssets(SECOND, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("500"));
        assert.equal(withdrawable.nfts[1], "0");

        await govPool.vote(1, 0, [], wei("1000"), [1, 2, 3, 4]);

        await truffleAssert.reverts(govPool.vote(1, 0, [], 0, [1, 4]), "Gov: NFT already voted");

        await setTime((await getCurrentBlockTime()) + 10000);

        withdrawable = await govPool.getWithdrawableAssets(SECOND, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("1000"));
        assert.equal(withdrawable.nfts[1], "0");

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), "0");

        await govPool.withdraw(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.withdraw(OWNER, 0, [1]);

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it("should deposit, vote, unlock", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await govPool.vote(1, 0, [], wei("1000"), [1, 2, 3, 4]);
        await govPool.vote(2, 0, [], wei("510"), [1, 2]);

        let withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts[1], "0");

        await govPool.unlockInProposals([1], OWNER, false);

        withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts[1], "0");

        await setTime((await getCurrentBlockTime()) + 10000);

        await govPool.unlockInProposals([2], OWNER, false);

        await govPool.withdraw(OWNER, wei("510"), [1]);

        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it("should not unlock nonexisting proposals", async () => {
        await truffleAssert.reverts(govPool.unlockInProposals([1], OWNER, false), "Gov: no vote for this proposal");
      });

      it("should not deposit zero tokens", async () => {
        await truffleAssert.reverts(govPool.deposit(OWNER, 0, []), "Gov: empty deposit");
      });

      it("should not withdraw zero tokens", async () => {
        await truffleAssert.reverts(govPool.withdraw(OWNER, 0, []), "Gov: empty withdrawal");
      });

      it("should not delegate zero tokens", async () => {
        await truffleAssert.reverts(govPool.delegate(OWNER, 0, []), "Gov: empty delegation");
      });

      it("should not undelegate zero tokens", async () => {
        await truffleAssert.reverts(govPool.undelegate(OWNER, 0, []), "Gov: empty undelegation");
      });
    });

    describe("deposit, delegate, vote, withdraw", () => {
      it("should deposit, delegate, vote delegated, undelegate and withdraw nfts", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await govPool.delegate(SECOND, wei("250"), [2]);
        await govPool.delegate(SECOND, wei("250"), []);
        await govPool.delegate(SECOND, 0, [4]);

        await govPool.voteDelegated(1, wei("400"), [4], { from: SECOND });

        let undelegateable = await govPool.getWithdrawableAssets(OWNER, SECOND);

        assert.equal(toBN(undelegateable.tokens).toFixed(), wei("100"));
        assert.deepEqual(undelegateable.nfts[0], ["2"]);

        await govPool.vote(1, 0, [], wei("500"), [1, 3]);

        await setTime((await getCurrentBlockTime()) + 10000);

        undelegateable = await govPool.getWithdrawableAssets(OWNER, SECOND);

        assert.equal(toBN(undelegateable.tokens).toFixed(), wei("500"));
        assert.deepEqual(undelegateable.nfts[0], ["2", "4"]);

        await govPool.undelegate(SECOND, wei("250"), [2]);
        await govPool.undelegate(SECOND, wei("250"), []);
        await govPool.undelegate(SECOND, 0, [4]);

        await govPool.withdraw(OWNER, wei("1000"), [1, 2, 3, 4]);
      });
    });

    describe("execute()", () => {
      const NEW_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: false,
        validatorsVote: true,
        duration: 1,
        durationValidators: 1,
        quorum: 1,
        quorumValidators: 1,
        minVotesForVoting: 1,
        minVotesForCreating: 1,
        rewardToken: ZERO_ADDR,
        creationReward: 0,
        executionReward: 0,
        voteRewardsCoefficient: 0,
        executorDescription: "new_settings",
      };

      const NEW_INTERNAL_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: false,
        validatorsVote: true,
        duration: 500,
        durationValidators: 60,
        quorum: PRECISION.times("1").toFixed(),
        quorumValidators: PRECISION.times("1").toFixed(),
        minVotesForVoting: wei("1"),
        minVotesForCreating: wei("1"),
        rewardToken: ZERO_ADDR,
        creationReward: 0,
        executionReward: 0,
        voteRewardsCoefficient: 0,
        executorDescription: "new_internal_settings",
      };

      beforeEach(async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(OWNER, wei("1000"), []);
        await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should add new settings", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR)).tokens.toFixed(), "0");

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR)).tokens.toFixed(), wei("1000"));

        await govPool.execute(1);

        assert.equal((await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR)).tokens.toFixed(), wei("1000"));

        const addedSettings = await settings.settings(4);

        assert.isTrue(addedSettings.earlyCompletion);
        assert.isFalse(addedSettings.delegatedVotingAllowed);
        assert.equal(addedSettings.duration, 1);
        assert.equal(addedSettings.durationValidators, 1);
        assert.equal(addedSettings.quorum, 1);
        assert.equal(addedSettings.quorumValidators, 1);
        assert.equal(addedSettings.minVotesForVoting, 1);
        assert.equal(addedSettings.minVotesForCreating, 1);

        assert.isTrue((await getProposalByIndex(1)).core.executed);
      });

      it("should not execute random proposals", async () => {
        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should change settings then full vote", async () => {
        const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.deposit(OWNER, 0, [1, 2, 3, 4]);
        await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(2, 0, [], wei("1000"), [1, 2, 3, 4]);
        await truffleAssert.reverts(
          govPool.voteDelegated(2, wei("1000"), [1, 2, 3, 4], { from: SECOND }),
          "Gov: delegated voting off"
        );
      });

      it("should change validator balances through execution", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [validators.address], [0], [validatorsBytes]);

        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await truffleAssert.reverts(govPool.vote(1, 0, [], wei("1000"), []), "Gov: vote unavailable");

        const validatorsToken = await ERC20Mock.at(await validators.govValidatorsToken());

        assert.equal((await validatorsToken.balanceOf(THIRD)).toFixed(), wei("10"));
      });

      it("should not execute defeated proposal", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [validators.address], [0], [validatorsBytes]);

        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);

        await setTime((await getCurrentBlockTime()) + 100000);

        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should add new settings, change executors and create default trusted proposal", async () => {
        const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);

        const addSettingsBytes = getBytesAddSettings([NEW_SETTINGS]);
        const changeExecutorBytes = getBytesChangeExecutors([executorTransfer.address], [4]);

        assert.equal(await govPool.getProposalState(1), ProposalState.Undefined);

        await govPool.createProposal(
          "example.com",
          [settings.address, settings.address],
          [0, 0],
          [addSettingsBytes, changeExecutorBytes]
        );

        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        assert.equal(await govPool.getProposalState(1), ProposalState.Executed);
        assert.equal(toBN(await settings.executorToSettings(executorTransfer.address)).toFixed(), "4");

        const bytesExecute = getBytesExecute();
        const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

        await govPool.createProposal(
          "example.com",
          [token.address, executorTransfer.address],
          [wei("1"), wei("1")],
          [bytesApprove, bytesExecute]
        );

        assert.equal(
          (await getProposalByIndex(2)).core.settings.executorDescription,
          POOL_PARAMETERS.settingsParams.proposalSettings[0].executorDescription
        );

        await govPool.createProposal(
          "example.com",
          [token.address, executorTransfer.address],
          ["0", wei("1")],
          [bytesApprove, bytesExecute]
        );

        assert.equal((await getProposalByIndex(3)).core.settings.executorDescription, NEW_SETTINGS.executorDescription);
      });

      it("should execute proposal and send ether", async () => {
        let startTime = await getCurrentBlockTime();

        const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);
        await executorTransfer.setTransferAmount(wei("99"));

        await token.transfer(govPool.address, wei("100"));
        await govPool.sendTransaction({ value: wei("1"), from: OWNER });

        const bytesExecute = getBytesExecute();
        const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

        await govPool.createProposal(
          "example.com",
          [token.address, executorTransfer.address],
          ["0", wei("1")],
          [bytesApprove, bytesExecute]
        );
        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal(await web3.eth.getBalance(executorTransfer.address), "0");

        await truffleAssert.passes(govPool.execute(1), "Executed");

        assert.equal(await web3.eth.getBalance(executorTransfer.address), wei("1"));
      });

      it("should get revert from proposal call", async () => {
        let startTime = await getCurrentBlockTime();

        const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);
        await executorTransfer.setTransferAmount(wei("99"));

        await token.transfer(govPool.address, wei("100"));

        const bytesExecute = getBytesExecute();

        await govPool.createProposal("example.com", [executorTransfer.address], [0], [bytesExecute]);
        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await truffleAssert.reverts(govPool.execute(1), "ERC20: insufficient allowance");
      });

      describe("self execution", () => {
        describe("editDescriptionURL()", () => {
          it("should create proposal for editDescriptionURL", async () => {
            const newUrl = "new_url";
            const bytesEditUrl = getBytesEditUrl(newUrl);

            await govPool.createProposal("example.com", [govPool.address], [0], [bytesEditUrl]);

            await govPool.vote(1, 0, [], wei("1000"), []);
            await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false);
            await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

            await govPool.execute(1);

            assert.equal(await govPool.descriptionURL(), newUrl);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.editDescriptionURL("new_url"), "Gov: not this contract");
          });
        });

        describe("setNftMultiplierAddress()", () => {
          it("should create proposal for setNftMultiplierAddress", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);
            assert.equal(await govPool.nftMultiplier(), nftMultiplier.address);
          });

          it("should not set zero address", async () => {
            await truffleAssert.reverts(setNftMultiplierAddress(ZERO_ADDR), "Gov: new nft address is zero");
          });

          it("should revert setNftMultiplierAddress if it's been already set", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);
            await truffleAssert.reverts(setNftMultiplierAddress(ETHER_ADDR), "Gov: current nft address isn't zero");

            assert.equal(await govPool.nftMultiplier(), nftMultiplier.address);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(
              govPool.setNftMultiplierAddress(nftMultiplier.address),
              "Gov: not this contract"
            );
          });
        });
      });
    });

    describe("getProposals() latestProposalId()", () => {
      const proposalViewToObject = (proposalView) => {
        return {
          proposal: {
            descriptionURL: proposalView.proposal[1],
            executors: proposalView.proposal[2],
            values: proposalView.proposal[3],
            data: proposalView.proposal[4],
          },
          validatorProposal: {
            core: {
              voteEnd: proposalView.validatorProposal.core.voteEnd,
              quorum: proposalView.validatorProposal.core.quorum,
            },
          },
        };
      };

      it("should not return proposals if no proposals", async () => {
        const proposals = await govPool.getProposals(0, 1);
        assert.deepEqual(proposals, []);
      });

      it("should return zero latestProposalId if no proposals", async () => {
        assert.equal(await govPool.latestProposalId(), 0);
      });

      describe("after adding internal proposals", async () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 70,
          durationValidators: 800,
          quorum: PRECISION.times("71").toFixed(),
          quorumValidators: PRECISION.times("100").toFixed(),
          minVotesForVoting: wei("20"),
          minVotesForCreating: wei("3"),
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        let proposalViews;

        beforeEach("setup", async () => {
          const { durationValidators, quorumValidators } = POOL_PARAMETERS.settingsParams.proposalSettings[3];
          const startTime = await getCurrentBlockTime();

          proposalViews = [
            {
              proposal: {
                descriptionURL: "example.com",
                executors: [SECOND],
                values: ["0"],
                data: [getBytesApprove(SECOND, 1)],
              },
              validatorProposal: {
                core: {
                  voteEnd: "0",
                  quorum: "0",
                },
              },
            },
            {
              proposal: {
                descriptionURL: "example2.com",
                executors: [THIRD],
                values: ["0"],
                data: [getBytesApprove(SECOND, 1)],
              },
              validatorProposal: {
                core: {
                  voteEnd: "0",
                  quorum: "0",
                },
              },
            },
            {
              proposal: {
                descriptionURL: "example3.com",
                executors: [settings.address],
                values: ["0"],
                data: [getBytesEditSettings([3], [NEW_SETTINGS])],
              },
              validatorProposal: {
                core: {
                  voteEnd: (durationValidators + startTime + 1000000 + 1).toString(),
                  quorum: quorumValidators,
                },
              },
            },
          ];

          for (const proposalView of proposalViews) {
            const { descriptionURL, executors, values, data } = proposalView.proposal;
            await govPool.createProposal(descriptionURL, executors, values, data);
          }

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
          await govPool.vote(3, wei("1000"), [], wei("1000"), []);
          await govPool.vote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], { from: SECOND });

          await setTime(startTime + 1000000);
          await govPool.moveProposalToValidators(3);
        });

        it("should return latestProposalId properly", async () => {
          assert.equal(await govPool.latestProposalId(), proposalViews.length);
        });

        it("should return whole range properly", async () => {
          const proposals = (await govPool.getProposals(0, 3)).map(proposalViewToObject);
          assert.deepEqual(proposals, proposalViews);
        });

        it("should return proposals properly from the middle of the range", async () => {
          const proposals = (await govPool.getProposals(1, 1)).map(proposalViewToObject);
          assert.deepEqual(proposals, proposalViews.slice(1, 2));
        });

        it("should return proposals properly if offset + limit > latestProposalId", async () => {
          const proposals = (await govPool.getProposals(1, 6)).map(proposalViewToObject);
          assert.deepEqual(proposals, proposalViews.slice(1));
        });

        it("should not return proposals if offset > latestProposalId", async () => {
          const proposals = (await govPool.getProposals(4, 1)).map(proposalViewToObject);
          assert.deepEqual(proposals, []);
        });
      });
    });

    describe("reward", () => {
      let NEW_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 1,
        durationValidators: 1,
        quorum: 1,
        quorumValidators: 1,
        minVotesForVoting: 1,
        minVotesForCreating: 1,
        rewardToken: ETHER_ADDR,
        creationReward: wei("10"),
        executionReward: wei("5"),
        voteRewardsCoefficient: PRECISION.toFixed(),
        executorDescription: "new_settings",
      };

      let treasury;

      beforeEach(async () => {
        treasury = await contractsRegistry.getTreasuryContract();

        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(OWNER, wei("1000"), []);
        await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should claim reward", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("1"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        await govPool.execute(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000005.2"));

        await govPool.claimRewards([1]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("26"));
      });

      it("should claim reward properly if nft multiplier has been set", async () => {
        await setNftMultiplierAddress(nftMultiplier.address);

        await nftMultiplier.mint(OWNER, PRECISION.times("2.5"), 1000);
        await nftMultiplier.lock(1);

        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(2, 0, [], wei("1"), []);
        await govPool.vote(2, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);
        await validators.vote(2, wei("100"), false);
        await validators.vote(2, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(2);
        await govPool.claimRewards([2]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("91")); // 91 = 26 + 26 * 2.5
      });

      it("should execute and claim", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("1"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        await govPool.executeAndClaim(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000005.2"));
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("26"));
      });

      it("should claim reward in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await network.provider.send("hardhat_setBalance", [govPool.address, "0x" + wei("100")]);

        await govPool.execute(1);

        await govPool.createProposal("example.com", [settings.address], [0], [getBytesAddSettings([NEW_SETTINGS])]);
        await govPool.vote(2, 0, [], wei("1"), []);

        assert.equal(await web3.eth.getBalance(treasury), "0");

        await govPool.execute(2);

        assert.equal(await web3.eth.getBalance(treasury), wei("3.2"));

        let balance = toBN(await web3.eth.getBalance(OWNER));

        let tx = await govPool.claimRewards([2]);

        assert.equal(
          await web3.eth.getBalance(OWNER),
          balance.plus(wei("16")).minus(toBN(tx.receipt.gasUsed).times(tx.receipt.effectiveGasPrice)).toFixed()
        );
      });

      it("should not claim rewards in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("1"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.executeAndClaim(1);

        await impersonate(coreProperties.address);

        await token.mint(coreProperties.address, wei("100000000000000000000"));
        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: coreProperties.address });

        await govPool.deposit(coreProperties.address, wei("100000000000000000000"), [], {
          from: coreProperties.address,
        });

        await network.provider.send("hardhat_setBalance", [
          govPool.address, // address
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", // balance
        ]);

        await govPool.createProposal("example.com", [settings.address], [0], [getBytesAddSettings([NEW_SETTINGS])], {
          from: coreProperties.address,
        });

        await govPool.vote(2, 0, [], wei("100000000000000000000"), [], { from: coreProperties.address });

        await govPool.execute(2);

        await truffleAssert.reverts(
          govPool.claimRewards([2], { from: coreProperties.address }),
          "Gov: failed to send eth"
        );
      });

      it("should revert when rewards off", async () => {
        let NO_REWARDS_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          validatorsVote: false,
          duration: 1,
          durationValidators: 1,
          quorum: 1,
          quorumValidators: 1,
          minVotesForVoting: 1,
          minVotesForCreating: 1,
          rewardToken: ZERO_ADDR,
          creationReward: wei("10"),
          executionReward: wei("5"),
          voteRewardsCoefficient: PRECISION.toFixed(),
          executorDescription: "new_settings",
        };

        const bytes = getBytesEditSettings([1], [NO_REWARDS_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal("example.com", [settings.address], [0], [getBytesAddSettings([NEW_SETTINGS])]);
        await govPool.vote(2, 0, [], wei("1"), []);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "Gov: rewards off");
      });

      it("should revert when try claim reward before execute", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await truffleAssert.reverts(govPool.claimRewards([1]), "Gov: proposal not executed");
      });

      it("should revert when balance < rewards", async () => {
        let newToken = await ERC20Mock.new("NT", "NT", 18);

        NEW_SETTINGS.rewardToken = newToken.address;

        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal("example.com", [settings.address], [0], [getBytesAddSettings([NEW_SETTINGS])]);
        await govPool.vote(2, 0, [], wei("1"), []);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "Gov: not enough balance");
      });
    });
  });
});
