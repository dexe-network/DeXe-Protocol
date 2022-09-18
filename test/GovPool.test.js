const { toBN, accounts, wei } = require("../scripts/helpers/utils");
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
} = require("./utils/gov-pool-utils");
const { ZERO, ETHER, PRECISION, ProposalState, DEFAULT_CORE_PROPERTIES } = require("./utils/constants");
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
const ERC20Mock = artifacts.require("ERC20Mock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");

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

  let settings;
  let validators;
  let userKeeper;
  let dp;
  let govPool;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FOURTH = await accounts(3);
    FACTORY = await accounts(4);
    NOTHING = await accounts(9);
  });

  beforeEach("setup", async () => {
    contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");
    rewardToken = await ERC20Mock.new("REWARD", "RWD", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), ETHER);
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
      poolParams.settingsParams.internalProposalSettings,
      poolParams.settingsParams.distributionProposalSettings,
      poolParams.settingsParams.validatorsBalancesSettings,
      poolParams.settingsParams.defaultProposalSettings
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
      poolParams.descriptionURL
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

  describe("Fullfat GovPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        settingsParams: {
          internalProposalSettings: {
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
            voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
            executorDescription: "internal",
          },
          distributionProposalSettings: {
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
            voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
            executorDescription: "DP",
          },
          validatorsBalancesSettings: {
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
            voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
            executorDescription: "validators",
          },
          defaultProposalSettings: {
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
            voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
            executorDescription: "default",
          },
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
        descriptionURL: "example.com",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    describe("init()", () => {
      it("should correctly set all parameters", async () => {
        assert.equal(await govPool.govSetting(), settings.address);
        assert.equal(await govPool.govUserKeeper(), userKeeper.address);
        assert.equal(await govPool.govValidators(), validators.address);
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
            POOL_PARAMETERS.descriptionURL
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
        assert.equal(await userKeeper.tokenBalance(OWNER, false, false), "0");
        assert.equal(await userKeeper.nftBalance(OWNER, false, false), "0");

        await govPool.deposit(OWNER, wei("100"), [1, 2, 3]);

        assert.equal(await userKeeper.tokenBalance(OWNER, false, false), wei("100"));
        assert.equal(await userKeeper.nftBalance(OWNER, false, false), "3");
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
        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(beforeUnlock.withdrawableTokens.toFixed(), wei("900"));
        assert.deepEqual(beforeUnlock.withdrawableNfts[0].slice(0, beforeUnlock.withdrawableNfts[1]), ["1", "3", "4"]);

        await setTime(startTime + 1000);
        await govPool.unlockInProposals([1], OWNER, false);

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(afterUnlock.withdrawableTokens.toFixed(), wei("1000"));
        assert.deepEqual(afterUnlock.withdrawableNfts[0].slice(0, afterUnlock.withdrawableNfts[1]), [
          "1",
          "2",
          "3",
          "4",
        ]);
      });

      it("should unlock all", async () => {
        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(beforeUnlock.withdrawableTokens.toFixed(), wei("900"));
        assert.deepEqual(beforeUnlock.withdrawableNfts[0].slice(0, beforeUnlock.withdrawableNfts[1]), ["1", "3", "4"]);

        await setTime(startTime + 1000);
        await govPool.unlock(OWNER, false);

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(afterUnlock.withdrawableTokens.toFixed(), wei("1000"));
        assert.deepEqual(afterUnlock.withdrawableNfts[0].slice(0, afterUnlock.withdrawableNfts[1]), [
          "1",
          "2",
          "3",
          "4",
        ]);
      });
    });

    describe("createProposal()", () => {
      beforeEach("", async () => {
        await govPool.deposit(OWNER, 1, [1]);
      });

      it("should create 2 proposals", async () => {
        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        let proposal = await govPool.proposals(1);
        let defaultSettings = POOL_PARAMETERS.settingsParams.defaultProposalSettings;

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
        assert.equal(proposal.core.proposalId, 1);
        assert.equal(proposal.descriptionURL, "example.com");

        await govPool.createProposal("example2.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
        proposal = await govPool.proposals(2);

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
        assert.equal(proposal.core.proposalId, 2);
        assert.equal(proposal.descriptionURL, "example2.com");
      });

      it("should not create proposal due to low voting power", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", [SECOND], [0], [getBytesApprove(SECOND, 1)], { from: SECOND }),
          "Gov: low voting power"
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
                getBytesAddSettings([POOL_PARAMETERS.settingsParams.distributionProposalSettings]),
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
                getBytesAddSettings([POOL_PARAMETERS.settingsParams.distributionProposalSettings]),
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
              [getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.defaultProposalSettings])]
            ),
            "Gov: invalid internal data"
          );

          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              [settings.address],
              [0],
              [getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.defaultProposalSettings])]
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
          rewardToken: ZERO,
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
            [getBytesAddSettings([NEW_SETTINGS]), getBytesChangeExecutors([THIRD], [5])]
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

          const proposal = await govPool.proposals(2);

          assert.equal(toBN(proposal.core.settings.quorum).toFixed(), NEW_SETTINGS.quorum);
        });

        it("should create default proposal", async () => {
          await govPool.createProposal(
            "example.com",
            [THIRD, THIRD],
            [0, 0],
            [getBytesAddSettings([NEW_SETTINGS]), getBytesAddSettings([NEW_SETTINGS])]
          );

          const proposal = await govPool.proposals(2);

          assert.equal(
            toBN(proposal.core.settings.quorum).toFixed(),
            POOL_PARAMETERS.settingsParams.defaultProposalSettings.quorum
          );
        });
      });
    });

    describe("getProposalInfo()", () => {
      beforeEach("", async () => {
        await govPool.deposit(OWNER, 1, [1]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
      });

      it("should get info from 2 proposals", async () => {
        let info = await govPool.getProposalInfo(1);

        assert.equal(info[0], SECOND);
        assert.equal(info[1], getBytesApprove(SECOND, 1));

        info = await govPool.getProposalInfo(2);

        assert.equal(info[0], THIRD);
        assert.equal(info[1], getBytesApprove(SECOND, 1));
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

          assert.equal((await govPool.proposals(1)).descriptionURL, "example.com");
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).core.votesFor, wei("50"));
        });

        it("should not vote if votes limit is reached", async () => {
          await coreProperties.setGovVotesLimit(0);

          await truffleAssert.reverts(govPool.vote(1, 0, [], wei("100"), []), "Gov: vote limit reached");
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));

          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("200"));
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

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).core.votesFor, wei("50"));
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));

          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("200"));

          const total = await govPool.getTotalVotes(1, SECOND, true);

          assert.equal(toBN(total[0]).toFixed(), wei("200"));
          assert.equal(toBN(total[1]).toFixed(), wei("200"));
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegated(1, wei("500"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("500"));
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

          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], 0, [1]);
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.vote(1, 0, [], 0, [2, 3]);
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.times(3).plus(1).toFixed());
        });

        it("should revert when order is wrong", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], 0, [3, 2]), "Gov: wrong NFT order");
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

          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote delegated nfts twice", async () => {
          await govPool.voteDelegated(1, 0, [2], { from: THIRD });
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.voteDelegated(1, 0, [3], { from: THIRD });
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.times(2).toFixed());
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
          rewardToken: ZERO,
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

          const proposal = await govPool.proposals(3);

          await govPool.moveProposalToValidators(3);

          const afterMove = await validators.externalProposals(3);

          assert.equal(await govPool.getProposalState(3), ProposalState.ValidatorVoting);

          assert.equal(proposal.core.executed, afterMove.executed);
          assert.equal(proposal.core.settings.quorumValidators, afterMove.quorum);

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

        let proposals = await govPool.getUserProposals(SECOND, false);
        let withdrawable = await govPool.getWithdrawableAssets(SECOND);

        assert.deepEqual(proposals.unlockedIds[0], ["0"]);
        assert.deepEqual(proposals.lockedIds[0], ["1"]);
        assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), wei("500"));
        assert.equal(withdrawable.withdrawableNfts[1], "0");

        await govPool.vote(1, 0, [], wei("1000"), [1, 2, 3, 4]);

        await truffleAssert.reverts(govPool.vote(1, 0, [], 0, [1, 4]), "Gov: NFT already voted");

        await setTime((await getCurrentBlockTime()) + 10000);

        proposals = await govPool.getUserProposals(SECOND, false);
        withdrawable = await govPool.getWithdrawableAssets(SECOND);

        assert.deepEqual(proposals.unlockedIds[0], ["1"]);
        assert.deepEqual(proposals.lockedIds[0], ["0"]);
        assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), wei("1000"));
        assert.equal(withdrawable.withdrawableNfts[1], "0");

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

        let withdrawable = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), "0");
        assert.equal(withdrawable.withdrawableNfts[1], "0");

        await govPool.unlockInProposals([1], OWNER, false);

        withdrawable = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), "0");
        assert.equal(withdrawable.withdrawableNfts[1], "0");

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

        let proposals = await govPool.getUserProposals(SECOND, true);
        let undelegateable = await govPool.getUndelegateableAssets(OWNER, SECOND);

        assert.deepEqual(proposals.unlockedIds[0], ["0"]);
        assert.deepEqual(proposals.lockedIds[0], ["1"]);
        assert.equal(toBN(undelegateable.undelegateableTokens).toFixed(), wei("100"));
        assert.deepEqual(undelegateable.undelegateableNfts[0], ["2"]);

        await govPool.vote(1, 0, [], wei("500"), [1, 3]);

        await setTime((await getCurrentBlockTime()) + 10000);

        proposals = await govPool.getUserProposals(SECOND, true);
        undelegateable = await govPool.getUndelegateableAssets(OWNER, SECOND);

        assert.deepEqual(proposals.unlockedIds[0], ["1"]);
        assert.deepEqual(proposals.lockedIds[0], ["0"]);
        assert.equal(toBN(undelegateable.undelegateableTokens).toFixed(), wei("500"));
        assert.deepEqual(undelegateable.undelegateableNfts[0], ["2", "4"]);

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
        rewardToken: ZERO,
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
        rewardToken: ZERO,
        creationReward: 0,
        executionReward: 0,
        voteRewardsCoefficient: 0,
        executorDescription: "new_settings",
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

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        const addedSettings = await settings.settings(5);

        assert.isTrue(addedSettings.earlyCompletion);
        assert.isFalse(addedSettings.delegatedVotingAllowed);
        assert.equal(addedSettings.duration, 1);
        assert.equal(addedSettings.durationValidators, 1);
        assert.equal(addedSettings.quorum, 1);
        assert.equal(addedSettings.quorumValidators, 1);
        assert.equal(addedSettings.minVotesForVoting, 1);
        assert.equal(addedSettings.minVotesForCreating, 1);

        assert.isTrue((await govPool.proposals(1)).core.executed);
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

        const proposals = await govPool.getUserProposals(OWNER, false);

        assert.deepEqual(proposals.unlockedIds[0], ["1"]);

        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should add new settings, change executors and create default trusted proposal", async () => {
        const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);

        const settingsBytes = getBytesAddSettings([NEW_SETTINGS]);
        const changeExecutorBytes = getBytesChangeExecutors([executorTransfer.address], [4]);

        assert.equal(await govPool.getProposalState(1), ProposalState.Undefined);

        await govPool.createProposal(
          "example.com",
          [settings.address, settings.address],
          [0, 0],
          [settingsBytes, changeExecutorBytes]
        );

        await govPool.vote(1, 0, [], wei("1000"), []);
        await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

        let proposals = await govPool.getUserProposals(OWNER, false);

        assert.deepEqual(proposals.lockedIds[0], ["1"]);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        proposals = await govPool.getUserProposals(OWNER, false);

        assert.deepEqual(proposals.unlockedIds[0], ["1"]);

        await govPool.execute(1);

        proposals = await govPool.getUserProposals(OWNER, false);

        assert.deepEqual(proposals.unlockedIds[0], ["1"]);

        assert.equal(await govPool.getProposalState(1), ProposalState.Executed);
        assert.equal((await settings.executorInfo(executorTransfer.address))[0], 4);

        const bytesExecute = getBytesExecute();
        const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

        await govPool.createProposal(
          "example.com",
          [token.address, executorTransfer.address],
          [wei("1"), wei("1")],
          [bytesApprove, bytesExecute]
        );

        assert.equal(
          (await govPool.proposals(2)).core.settings[3],
          POOL_PARAMETERS.settingsParams.defaultProposalSettings.duration
        );

        await govPool.createProposal(
          "example.com",
          [token.address, executorTransfer.address],
          ["0", wei("1")],
          [bytesApprove, bytesExecute]
        );

        assert.equal((await govPool.proposals(3)).core.settings[2], NEW_SETTINGS.duration);
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
        rewardToken: ETHER,
        creationReward: wei("10"),
        executionReward: wei("5"),
        voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
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

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000003.2"));

        await govPool.claimRewards([1]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("16"));
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

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000003.2"));
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("16"));
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
          rewardToken: ZERO,
          creationReward: wei("10"),
          executionReward: wei("5"),
          voteRewardsCoefficient: toBN("10").pow("25").toFixed(),
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
