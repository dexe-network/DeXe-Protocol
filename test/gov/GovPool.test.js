const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { toPercent } = require("../utils/utils");
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
  getBytesChangeVerifier,
  getBytesChangeBABTRestriction,
  getBytesGovExecute,
  getBytesGovClaimRewards,
  getBytesGovVote,
  getBytesGovDeposit,
  getBytesKeeperWithdrawTokens,
  getBytesGovVoteDelegated,
} = require("../utils/gov-pool-utils");
const { ZERO_ADDR, ETHER_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { ProposalState, DEFAULT_CORE_PROPERTIES, ValidatorsProposalState } = require("../utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime, setNextBlockTime } = require("../helpers/block-helper");
const { impersonate } = require("../helpers/impersonator");
const { assert } = require("chai");
const ethSigUtil = require("@metamask/eth-sig-util");
const { web3 } = require("hardhat");

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
const ERC721Power = artifacts.require("ERC721Power");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolStakingLib = artifacts.require("GovPoolStaking");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");

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
BABTMock.numberFormat = "BigNumber";
ExecutorTransferMock.numberFormat = "BigNumber";

describe("GovPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FOURTH;
  let FIFTH;
  let SIXTH;
  let FACTORY;
  let NOTHING;

  let contractsRegistry;
  let coreProperties;
  let poolRegistry;

  let token;
  let nft;
  let nftPower;
  let rewardToken;
  let nftMultiplier;
  let babt;

  let settings;
  let validators;
  let userKeeper;
  let dp;
  let govPool;

  const reverter = new Reverter();

  const getProposalByIndex = async (index) => (await govPool.getProposals(index - 1, 1))[0].proposal;

  async function depositAndVote(proposalId, depositAmount, depositNftIds, voteAmount, voteNftIds, from) {
    await govPool.multicall(
      [getBytesGovDeposit(from, depositAmount, depositNftIds), getBytesGovVote(proposalId, voteAmount, voteNftIds)],
      { from: from }
    );
  }

  async function executeAndClaim(proposalId, from) {
    await govPool.multicall([getBytesGovExecute(proposalId), getBytesGovClaimRewards([proposalId])], { from: from });
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FOURTH = await accounts(3);
    FIFTH = await accounts(4);
    SIXTH = await accounts(5);
    FACTORY = await accounts(6);
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

    await GovUserKeeper.link(govUserKeeperViewLib);

    await GovPool.link(govPoolCreateLib);
    await GovPool.link(govPoolExecuteLib);
    await GovPool.link(govPoolRewardsLib);
    await GovPool.link(govPoolUnlockLib);
    await GovPool.link(govPoolVoteLib);
    await GovPool.link(govPoolViewLib);
    await GovPool.link(govPoolStakingLib);
    await GovPool.link(govPoolOffchainLib);

    contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    babt = await BABTMock.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");

    nftMultiplier = await ERC721Multiplier.new();
    await nftMultiplier.__ERC721Multiplier_init("NFTMultiplierMock", "NFTMM");

    nftPower = await ERC721Power.new();
    await nftPower.__ERC721Power_init(
      "NFTPowerMock",
      "NFTPM",
      (await getCurrentBlockTime()) + 200,
      token.address,
      toPercent("90"),
      toPercent("0.01"),
      "540"
    );

    rewardToken = await ERC20Mock.new("REWARD", "RWD", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), ETHER_ADDR);
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

  async function getPoolParameters(nftAddress) {
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
            minVotesForVoting: nftAddress === nftPower.address ? 0 : wei("20"),
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
        nftAddress: nftAddress,
        totalPowerInTokens: wei("33000"),
        nftsTotalSupply: 33,
      },
      nftMultiplierAddress: ZERO_ADDR,
      verifier: OWNER,
      onlyBABTHolders: false,
      deployerBABTid: 1,
      descriptionURL: "example.com",
      name: "Pool name",
    };
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

    await govPool.createProposal("example.com", "misc", [govPool.address], [0], [bytesSetAddress]);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, wei("1000"), []);
    await govPool.vote(proposalId, wei("100000000000000000000"), [], { from: SECOND });

    await govPool.moveProposalToValidators(proposalId);
    await validators.vote(proposalId, wei("100"), false);
    await validators.vote(proposalId, wei("1000000000000"), false, { from: SECOND });

    await govPool.execute(proposalId);
  }

  const assertBalanceDistribution = (balances, coefficients) => {
    for (let i = 0; i < balances.length - 1; i++) {
      const epsilon = coefficients[i] + coefficients[i + 1];

      const lhs = balances[i].idiv(wei("1")).times(coefficients[i + 1]);
      const rhs = balances[i + 1].idiv(wei("1")).times(coefficients[i]);

      assert.closeTo(lhs.toNumber(), rhs.toNumber(), epsilon);
    }
  };

  const assertNoZerosBalanceDistribution = (balances, coefficients) => {
    balances.forEach((balance) => assert.notEqual(balance.toFixed(), "0"));

    assertBalanceDistribution(balances, coefficients);
  };

  describe("Fullfat GovPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = await getPoolParameters(nft.address);

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
            OWNER,
            POOL_PARAMETERS.onlyBABTHolders,
            POOL_PARAMETERS.deployerBABTid,
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

        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", "misc", [THIRD], [0], [getBytesApprove(SECOND, 1)]);

        startTime = await getCurrentBlockTime();

        await govPool.vote(1, wei("100"), [2]);
        await govPool.vote(2, wei("50"), []);
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

      it("should not create proposal if insufficient deposited amount", async () => {
        await govPool.withdraw(OWNER, 0, [1]);

        await truffleAssert.reverts(
          govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]),
          "Gov: low creating power"
        );
      });

      it("should create 2 proposals", async () => {
        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

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
        assert.equal((await govPool.getProposalRequiredQuorum(1)).toFixed(), wei("71000023430"));

        await govPool.createProposal("example2.com", "misc", [THIRD], [0], [getBytesApprove(SECOND, 2)]);
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
        assert.equal((await govPool.getProposalRequiredQuorum(2)).toFixed(), wei("71000023430"));

        assert.equal((await govPool.getProposalRequiredQuorum(3)).toFixed(), "0");
      });

      it("should not create proposal due to low voting power", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)], { from: SECOND }),
          "Gov: low creating power"
        );
      });

      it("should revert when creating proposal with arrays zero length", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", "misc", [], [0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
        await truffleAssert.reverts(
          govPool.createProposal("", "misc", [SECOND], [0, 0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
        await truffleAssert.reverts(
          govPool.createProposal("", "misc", [SECOND, THIRD], [0, 0], [getBytesApprove(SECOND, 1)]),
          "Gov: invalid array length"
        );
      });

      describe("validators", () => {
        it("should not create validators proposal if executors > 1", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              "misc",
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
              "misc",
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
              "misc",
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
              "misc",
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
              "misc",
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
              "misc",
              [settings.address],
              [1],
              [getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.proposalSettings[0]])]
            ),
            "Gov: invalid internal data"
          );

          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              "misc",
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
            "misc",
            [settings.address, settings.address],
            [0, 0],
            [getBytesAddSettings([NEW_SETTINGS]), getBytesChangeExecutors([THIRD], [4])]
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await depositAndVote(1, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(1, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);
        });

        it("should create trusted proposal", async () => {
          await govPool.createProposal(
            "example.com",
            "misc",
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
            "misc",
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

        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", "misc", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
      });

      describe("vote() tokens", () => {
        it("should vote for two proposals", async () => {
          await govPool.vote(1, wei("100"), []);
          await govPool.vote(2, wei("50"), []);

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

          await truffleAssert.reverts(govPool.vote(1, wei("100"), []), "Gov: vote limit reached");
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, wei("100"), []);

          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("100"));

          await govPool.vote(1, wei("100"), []);

          assert.equal((await getProposalByIndex(1)).core.votesFor, wei("200"));
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, []), "Gov: empty vote");
        });

        it("should not vote if low current vote power", async () => {
          await truffleAssert.reverts(govPool.vote(1, wei("1"), []), "Gov: low current vote power");
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

        it("should not vote if low current vote power", async () => {
          await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await truffleAssert.reverts(
            govPool.voteDelegated(1, wei("1"), [], { from: SECOND }),
            "Gov: low current vote power"
          );
        });
      });

      describe("if high minVotingPower", () => {
        beforeEach(async () => {
          const NEW_INTERNAL_SETTINGS = {
            earlyCompletion: true,
            delegatedVotingAllowed: true,
            validatorsVote: true,
            duration: 500,
            durationValidators: 600,
            quorum: PRECISION.times("51").toFixed(),
            quorumValidators: PRECISION.times("61").toFixed(),
            minVotesForVoting: wei("3500"),
            minVotesForCreating: wei("2"),
            rewardToken: rewardToken.address,
            creationReward: wei("10"),
            executionReward: wei("5"),
            voteRewardsCoefficient: PRECISION.toFixed(),
            executorDescription: "new_internal_settings",
          };

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

          await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("100"), false);
          await validators.vote(3, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(3);

          await nft.safeMint(OWNER, 10);

          await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        });

        describe("vote() nfts", () => {
          const SINGLE_NFT_COST = toBN("3666666666666666666666");

          it("should vote for two proposals", async () => {
            await govPool.vote(1, 0, [1]);
            await govPool.vote(2, 0, [2, 3]);

            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
            assert.equal((await getProposalByIndex(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());

            const voteInfo = await govPool.getUserVotes(1, OWNER, false);

            assert.equal(voteInfo.totalVoted, SINGLE_NFT_COST.toFixed());
            assert.equal(voteInfo.tokensVoted, "0");
            assert.deepEqual(voteInfo.nftsVoted, ["1"]);
          });

          it("should vote for proposal twice", async () => {
            await govPool.vote(1, 0, [1]);

            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

            await govPool.vote(1, 0, [2, 3]);
            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_COST.times(3).plus(1).toFixed());
          });

          it("should revert when voting with same NFTs", async () => {
            await truffleAssert.reverts(govPool.vote(1, 0, [2, 2]), "Gov: NFT already voted");
          });

          it("should not vote if low current vote power", async () => {
            await truffleAssert.reverts(govPool.vote(4, 0, [1]), "Gov: low current vote power");
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

          it("should not vote if low current vote power", async () => {
            await truffleAssert.reverts(
              govPool.voteDelegated(4, 0, [1], { from: SECOND }),
              "Gov: low current vote power"
            );
          });
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

        let startTime;

        beforeEach("setup", async () => {
          startTime = await getCurrentBlockTime();

          await govPool.createProposal(
            "example.com",
            "misc",
            [settings.address],
            [0],
            [getBytesEditSettings([3], [NEW_SETTINGS])]
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
        });

        it("should move proposal to validators", async () => {
          await depositAndVote(3, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

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
          await depositAndVote(3, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(3);

          await setTime(startTime + 1000000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
        });

        it("should revert when try move without vote", async () => {
          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
        });

        it("should revert when validators count is zero", async () => {
          await depositAndVote(3, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          assert.equal((await govPool.getProposalState(3)).toFixed(), ProposalState.WaitingForVotingTransfer);

          await validators.createInternalProposal(3, "", [0, 0], [OWNER, SECOND]);
          await validators.vote(1, wei("1000000000000"), true, { from: SECOND });
          await validators.execute(1);

          assert.equal((await validators.validatorsCount()).toFixed(), "0");
          assert.equal((await govPool.getProposalState(3)).toFixed(), ProposalState.Succeeded);

          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
        });
      });
    });

    describe("deposit, vote, withdraw", () => {
      it("should deposit, vote and withdraw tokens", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await token.mint(SECOND, wei("1000"));
        await token.approve(userKeeper.address, wei("1000"), { from: SECOND });

        await depositAndVote(1, wei("1000"), [], wei("500"), [], SECOND);

        let withdrawable = await govPool.getWithdrawableAssets(SECOND, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("500"));
        assert.equal(withdrawable.nfts[1], "0");

        await govPool.vote(1, wei("1000"), [1, 2, 3, 4]);

        await truffleAssert.reverts(govPool.vote(1, 0, [1, 4]), "Gov: NFT already voted");

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

        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await govPool.vote(1, wei("1000"), [1, 2, 3, 4]);
        await govPool.vote(2, wei("510"), [1, 2]);

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

        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

        await govPool.delegate(SECOND, wei("250"), [2]);
        await govPool.delegate(SECOND, wei("250"), []);
        await govPool.delegate(SECOND, 0, [4]);

        await govPool.voteDelegated(1, wei("400"), [4], { from: SECOND });

        let undelegateable = await govPool.getWithdrawableAssets(OWNER, SECOND);

        assert.equal(toBN(undelegateable.tokens).toFixed(), wei("100"));
        assert.deepEqual(undelegateable.nfts[0], ["2"]);

        await govPool.vote(1, wei("500"), [1, 3]);

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

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

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

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.deposit(OWNER, 0, [1, 2, 3, 4]);
        await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(2, wei("1000"), [1, 2, 3, 4]);
        await truffleAssert.reverts(
          govPool.voteDelegated(2, wei("1000"), [1, 2, 3, 4], { from: SECOND }),
          "Gov: delegated voting is off"
        );
      });

      it("should change validator balances through execution", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", "misc", [validators.address], [0], [validatorsBytes]);

        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await truffleAssert.reverts(govPool.vote(1, wei("1000"), []), "Gov: vote unavailable");

        const validatorsToken = await ERC20Mock.at(await validators.govValidatorsToken());

        assert.equal((await validatorsToken.balanceOf(THIRD)).toFixed(), wei("10"));
      });

      it("should not execute defeated proposal", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", "misc", [validators.address], [0], [validatorsBytes]);

        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

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
          "misc",
          [settings.address, settings.address],
          [0, 0],
          [addSettingsBytes, changeExecutorBytes]
        );

        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        assert.equal(await govPool.getProposalState(1), ProposalState.Executed);
        assert.equal((await validators.getProposalState(1, false)).toFixed(), ValidatorsProposalState.Executed);
        assert.equal(toBN(await settings.executorToSettings(executorTransfer.address)).toFixed(), "4");

        const bytesExecute = getBytesExecute();
        const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

        await govPool.createProposal(
          "example.com",
          "misc",
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
          "misc",
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
          "misc",
          [token.address, executorTransfer.address],
          ["0", wei("1")],
          [bytesApprove, bytesExecute]
        );
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

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

        await govPool.createProposal("example.com", "misc", [executorTransfer.address], [0], [bytesExecute]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

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

            await govPool.createProposal("example.com", "misc", [govPool.address], [0], [bytesEditUrl]);

            await govPool.vote(1, wei("1000"), []);
            await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

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

        describe("changeVerifier", () => {
          it("should correctly set new verifier", async () => {
            const newAddress = SECOND;
            const bytesChangeVerifier = getBytesChangeVerifier(newAddress);

            await govPool.createProposal("example.com", "misc", [govPool.address], [0], [bytesChangeVerifier]);

            await govPool.vote(1, wei("1000"), []);
            await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false);
            await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

            await govPool.execute(1);

            assert.equal(await govPool.getVerifier(), newAddress);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.changeVerifier(SECOND), "Gov: not this contract");
          });
        });

        describe("changeBABTRestriction", () => {
          it("should change restriction", async () => {
            assert.isFalse(await govPool.onlyBABTHolders());

            const bytesChangeBABTRestriction = getBytesChangeBABTRestriction(true);

            await govPool.createProposal("example.com", "misc", [govPool.address], [0], [bytesChangeBABTRestriction]);

            await govPool.vote(1, wei("1000"), []);
            await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false);
            await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

            await govPool.execute(1);

            assert.isTrue(await govPool.onlyBABTHolders());
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.changeBABTRestriction(true), "Gov: not this contract");
          });
        });

        describe("setLatestVoteBlock", () => {
          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.setLatestVoteBlock(1), "Gov: not this contract");
          });

          describe("vote-execute flashloan protection", () => {
            const USER_KEERER_SETTINGS = {
              earlyCompletion: true,
              delegatedVotingAllowed: true,
              validatorsVote: false,
              duration: 500,
              durationValidators: 500,
              quorum: PRECISION.times("1").toFixed(),
              quorumValidators: 0,
              minVotesForVoting: 0,
              minVotesForCreating: 0,
              rewardToken: ZERO_ADDR,
              creationReward: 0,
              executionReward: 0,
              voteRewardsCoefficient: 0,
              executorDescription: "new_internal_settings",
            };

            let VICTIM;
            let DELEGATOR;

            beforeEach(async () => {
              const addSettingsBytes = getBytesAddSettings([USER_KEERER_SETTINGS]);

              await govPool.createProposal("example.com", "misc", [settings.address], [0], [addSettingsBytes]);
              await govPool.vote(1, wei("1000"), []);
              await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

              await govPool.moveProposalToValidators(1);

              await validators.vote(1, wei("100"), false);
              await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

              await govPool.execute(1);

              const changeExecutorBytes = getBytesChangeExecutors([userKeeper.address], [4]);

              await govPool.createProposal("example.com", "misc", [settings.address], [0], [changeExecutorBytes]);
              await govPool.vote(2, wei("1000"), []);
              await govPool.vote(2, wei("100000000000000000000"), [], { from: SECOND });

              await govPool.moveProposalToValidators(2);

              await validators.vote(2, wei("100"), false);
              await validators.vote(2, wei("1000000000000"), false, { from: SECOND });

              await govPool.execute(2);

              VICTIM = THIRD;
              DELEGATOR = FOURTH;

              await token.mint(VICTIM, wei("111222"));
              await token.approve(userKeeper.address, wei("111222"), { from: VICTIM });
              await govPool.deposit(VICTIM, wei("111222"), [], { from: VICTIM });

              await token.mint(DELEGATOR, wei("100000000000000000000"));
              await token.approve(userKeeper.address, wei("100000000000000000000"), { from: DELEGATOR });
              await govPool.deposit(DELEGATOR, wei("100000000000000000000"), [], { from: DELEGATOR });
              await govPool.delegate(SECOND, wei("100000000000000000000"), [], { from: DELEGATOR });
            });

            it("should not withdraw victim's tokens in the same block if vote", async () => {
              const bytes = getBytesKeeperWithdrawTokens(VICTIM, SECOND, wei("111222"));

              await govPool.createProposal("example.com", "misc", [userKeeper.address], [0], [bytes], { from: SECOND });

              await truffleAssert.reverts(
                govPool.multicall([getBytesGovVote(3, wei("100000000000000000000"), []), getBytesGovExecute(3)], {
                  from: SECOND,
                }),
                "Gov: wrong block"
              );
            });

            it("should not withdraw victim's tokens in the same block if vote delegated", async () => {
              const bytes = getBytesKeeperWithdrawTokens(VICTIM, SECOND, wei("111222"));

              await govPool.createProposal("example.com", "misc", [userKeeper.address], [0], [bytes], { from: SECOND });

              await truffleAssert.reverts(
                govPool.multicall(
                  [getBytesGovVoteDelegated(3, wei("100000000000000000000"), []), getBytesGovExecute(3)],
                  {
                    from: SECOND,
                  }
                ),
                "Gov: wrong block"
              );
            });
          });
        });
      });
    });

    describe("getProposals() latestProposalId()", () => {
      const proposalViewToObject = (proposalView) => {
        return {
          proposal: {
            descriptionURL: proposalView.proposal[1],
            misc: "misc",
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
                misc: "misc",
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
                misc: "misc",
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
                misc: "misc",
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

          await govPool.deposit(OWNER, wei("1000"), []);

          for (const proposalView of proposalViews) {
            const { descriptionURL, executors, values, data } = proposalView.proposal;
            await govPool.createProposal(descriptionURL, "misc", executors, values, data);
          }

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
          await govPool.vote(3, wei("1000"), []);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

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

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        let rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainRewards, ["0"]);
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        await govPool.execute(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000205"));

        rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainRewards, [wei("1025")]);

        await govPool.claimRewards([1]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("1025"));
      });

      it("should claim reward properly if nft multiplier has been set", async () => {
        await setNftMultiplierAddress(nftMultiplier.address);

        await nftMultiplier.mint(OWNER, PRECISION.times("2.5"), 1000);
        await nftMultiplier.lock(1);

        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(2, wei("1000"), []);
        await govPool.vote(2, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);
        await validators.vote(2, wei("100"), false);
        await validators.vote(2, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(2);
        await govPool.claimRewards([2]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("3587.5")); // 1025 + 1025 * 2.5
      });

      it("should execute and claim", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        await executeAndClaim(1, OWNER);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("20000000000000000205"));
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("1025"));
      });

      it("should claim reward in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await network.provider.send("hardhat_setBalance", [govPool.address, "0x" + wei("100")]);

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",
          "misc",
          [settings.address],
          [0],
          [getBytesAddSettings([NEW_SETTINGS])]
        );
        await govPool.vote(2, wei("1"), []);

        assert.equal(await web3.eth.getBalance(treasury), "0");

        await govPool.execute(2);

        assert.equal(await web3.eth.getBalance(treasury), wei("3.2"));

        let balance = toBN(await web3.eth.getBalance(OWNER));

        let rewards = await govPool.getPendingRewards(OWNER, [1, 2]);

        assert.deepEqual(rewards.onchainRewards, [wei("25"), wei("16")]);
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        let tx = await govPool.claimRewards([2]);

        assert.equal(
          await web3.eth.getBalance(OWNER),
          balance.plus(wei("16")).minus(toBN(tx.receipt.gasUsed).times(tx.receipt.effectiveGasPrice)).toFixed()
        );
      });

      it("should not transfer commission if treasury is address(this)", async () => {
        treasury = govPool.address;

        await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), treasury);

        await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));

        await govPool.execute(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));
      });

      it("should not claim rewards in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("1000"), []);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await executeAndClaim(1, OWNER);

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

        await govPool.createProposal(
          "example.com",
          "misc",
          [settings.address],
          [0],
          [getBytesAddSettings([NEW_SETTINGS])],
          {
            from: coreProperties.address,
          }
        );

        await govPool.vote(2, wei("100000000000000000000"), [], { from: coreProperties.address });

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

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",
          "misc",
          [settings.address],
          [0],
          [getBytesAddSettings([NEW_SETTINGS])]
        );
        await govPool.vote(2, wei("1"), []);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "Gov: rewards are off");
      });

      it("should revert when try claim reward before execute", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await truffleAssert.reverts(govPool.claimRewards([1]), "Gov: proposal is not executed");
      });

      it("should revert when balance < rewards", async () => {
        let newToken = await ERC20Mock.new("NT", "NT", 18);

        NEW_SETTINGS.rewardToken = newToken.address;

        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);
        await govPool.vote(1, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",
          "misc",
          [settings.address],
          [0],
          [getBytesAddSettings([NEW_SETTINGS])]
        );
        await govPool.vote(2, wei("1"), []);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "Gov: not enough balance");
      });
    });

    describe("staking", () => {
      let NEW_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: true,
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

      let micropool;
      let micropool2;
      let delegator1;
      let delegator2;
      let delegator3;

      beforeEach(async () => {
        micropool = SECOND;
        micropool2 = THIRD;
        delegator1 = FOURTH;
        delegator2 = FIFTH;
        delegator3 = SIXTH;

        await token.mint(delegator1, wei("100000000000000000000"));
        await token.mint(delegator2, wei("100000000000000000000"));
        await token.mint(delegator3, wei("50000000000000000000"));

        for (let i = 10; i <= 13; i++) {
          await nft.safeMint(delegator1, i);
          await nft.approve(userKeeper.address, i, { from: delegator1 });
        }

        for (let i = 20; i <= 23; i++) {
          await nft.safeMint(delegator2, i);
          await nft.approve(userKeeper.address, i, { from: delegator2 });
        }

        for (let i = 30; i <= 31; i++) {
          await nft.safeMint(delegator3, i);
          await nft.approve(userKeeper.address, i, { from: delegator3 });
        }

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: delegator1 });
        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: delegator2 });
        await token.approve(userKeeper.address, wei("50000000000000000000"), { from: delegator3 });

        await govPool.deposit(OWNER, wei("2000"), [1, 2, 3, 4]);

        await govPool.deposit(delegator1, wei("100000000000000000000"), [10, 11, 12, 13], { from: delegator1 });
        await govPool.deposit(delegator2, wei("100000000000000000000"), [20, 21, 22, 23], { from: delegator2 });
        await govPool.deposit(delegator3, wei("50000000000000000000"), [30, 31], { from: delegator3 });
      });

      describe("delegate() undelegate() voteDelegated()", () => {
        it("should give the proportional rewards for delegated ERC20 + ERC721", async () => {
          await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await govPool.delegate(micropool, wei("100000000000000000000"), [10, 11, 12, 13], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [20, 21, 22, 23], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [30, 31], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);
          await govPool.claimRewards([1], { from: micropool });

          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          const micropoolBalance = await rewardToken.balanceOf(micropool);
          const balance1 = await rewardToken.balanceOf(delegator1);
          const balance2 = await rewardToken.balanceOf(delegator2);
          const balance3 = await rewardToken.balanceOf(delegator3);

          assertNoZerosBalanceDistribution([balance1, balance2, balance3, micropoolBalance], [32, 32, 16, 20]);
        });

        it("should give the proper rewards with multiple async delegates", async () => {
          await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await govPool.delegate(micropool, wei("1000"), [10, 11, 12, 13], { from: delegator1 });
          await govPool.voteDelegated(1, wei("800"), [], { from: micropool });

          await govPool.delegate(micropool, wei("1000"), [20, 21, 22, 23], { from: delegator2 });
          await govPool.voteDelegated(1, wei("800"), [], { from: micropool });

          await govPool.delegate(micropool, wei("500"), [30, 31], { from: delegator3 });
          await govPool.voteDelegated(1, wei("800"), [], { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.undelegate(micropool, wei("1000"), [10, 11, 12, 13], { from: delegator1 });
          await govPool.undelegate(micropool, wei("1000"), [20, 21, 22, 23], { from: delegator2 });
          await govPool.undelegate(micropool, wei("500"), [30, 31], { from: delegator3 });

          const balance1 = await rewardToken.balanceOf(delegator1);
          const balance2 = await rewardToken.balanceOf(delegator2);
          const balance3 = await rewardToken.balanceOf(delegator3);

          assertNoZerosBalanceDistribution([balance1, balance2, balance3], [19, 9, 2]);
        });

        it("should give the proper rewards when the same user delegates twice", async () => {
          await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await govPool.delegate(micropool, wei("250"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1250"), [], { from: delegator2 });

          await govPool.voteDelegated(1, wei("2000"), [], { from: micropool });

          await govPool.delegate(micropool, wei("2500"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator2 });

          await govPool.voteDelegated(1, wei("3000"), [], { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.undelegate(micropool, wei("3000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("2000"), [], { from: delegator2 });

          const balance1 = await rewardToken.balanceOf(delegator1);
          const balance2 = await rewardToken.balanceOf(delegator2);

          assertNoZerosBalanceDistribution([balance1, balance2], [23, 27]);
        });

        it("should give the proper rewards in native currency", async () => {
          await network.provider.send("hardhat_setBalance", [govPool.address, "0x" + wei("250000000000000000000")]);

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);

          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], { from: micropool });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",
            "misc",
            [settings.address],
            [0],
            [getBytesAddSettings([NEW_SETTINGS])]
          );

          await govPool.voteDelegated(2, wei("250000000000000000000"), [], { from: micropool });

          await govPool.execute(2);

          const balancesBefore = [
            toBN(await web3.eth.getBalance(micropool)),
            toBN(await web3.eth.getBalance(delegator1)),
            toBN(await web3.eth.getBalance(delegator2)),
            toBN(await web3.eth.getBalance(delegator3)),
          ];

          const txs = [
            await govPool.claimRewards([1, 2], { from: micropool }),
            await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator1 }),
            await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator2 }),
            await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator3 }),
          ];

          const etherRewards = [
            toBN(await web3.eth.getBalance(micropool))
              .plus(toBN(txs[0].receipt.gasUsed).times(txs[0].receipt.effectiveGasPrice))
              .minus(balancesBefore[0]),
            toBN(await web3.eth.getBalance(delegator1))
              .plus(toBN(txs[1].receipt.gasUsed).times(txs[1].receipt.effectiveGasPrice))
              .minus(balancesBefore[1]),
            toBN(await web3.eth.getBalance(delegator2))
              .plus(toBN(txs[2].receipt.gasUsed).times(txs[2].receipt.effectiveGasPrice))
              .minus(balancesBefore[2]),
            toBN(await web3.eth.getBalance(delegator3))
              .plus(toBN(txs[3].receipt.gasUsed).times(txs[3].receipt.effectiveGasPrice))
              .minus(balancesBefore[3]),
          ];

          const firstTokenBalances = [
            await rewardToken.balanceOf(micropool),
            await rewardToken.balanceOf(delegator1),
            await rewardToken.balanceOf(delegator2),
            await rewardToken.balanceOf(delegator3),
          ];

          assertNoZerosBalanceDistribution([...firstTokenBalances, ...etherRewards], [20, 32, 32, 16, 20, 32, 32, 16]);
        });

        it("should give the proper rewards in multiple reward tokens", async () => {
          const newRewardToken = await ERC20Mock.new("Mock", "Mock", 18);

          await newRewardToken.mint(govPool.address, wei("10000000000000000000000"));

          NEW_SETTINGS.rewardToken = newRewardToken.address;

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);

          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], { from: micropool });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",
            "misc",
            [settings.address],
            [0],
            [getBytesAddSettings([NEW_SETTINGS])]
          );

          await govPool.voteDelegated(2, wei("250000000000000000000"), [], { from: micropool });

          await govPool.execute(2);

          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.claimRewards([1, 2], { from: micropool });

          const firstTokenBalances = [
            await rewardToken.balanceOf(micropool),
            await rewardToken.balanceOf(delegator1),
            await rewardToken.balanceOf(delegator2),
            await rewardToken.balanceOf(delegator3),
          ];

          const secondTokenBalances = [
            await newRewardToken.balanceOf(micropool),
            await newRewardToken.balanceOf(delegator1),
            await newRewardToken.balanceOf(delegator2),
            await newRewardToken.balanceOf(delegator3),
          ];

          assertNoZerosBalanceDistribution(
            [...firstTokenBalances, ...secondTokenBalances],
            [20, 32, 32, 16, 20, 32, 32, 16]
          );
        });
      });

      describe("getDelegatorStakingRewards()", () => {
        const userStakeRewardsViewToObject = (rewards) => {
          return {
            micropool: rewards.micropool,
            rewardTokens: rewards.rewardTokens,
            expectedRewards: rewards.expectedRewards,
            realRewards: rewards.realRewards,
          };
        };

        const userStakeRewardsArrayToObject = (rewardsArray) => {
          return rewardsArray.map((rewards) => userStakeRewardsViewToObject(rewards));
        };

        it("should return delegator staking rewards properly", async () => {
          const zeroRewards = await govPool.getDelegatorStakingRewards(delegator1);

          assert.deepEqual(zeroRewards, []);

          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("25000000000000000000"), [], { from: delegator3 });

          await govPool.delegate(micropool2, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool2, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool2, wei("25000000000000000000"), [], { from: delegator3 });

          const newRewardToken = await ERC20Mock.new("Mock", "Mock", 18);

          await newRewardToken.mint(govPool.address, wei("80000000000000000000"));

          NEW_SETTINGS.rewardToken = newRewardToken.address;
          NEW_SETTINGS.earlyCompletion = false;
          NEW_SETTINGS.duration = 2;
          NEW_SETTINGS.creationReward = 0;
          NEW_SETTINGS.executionReward = 0;

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", "misc", [settings.address], [0], [bytes]);

          await govPool.voteDelegated(1, wei("125000000000000000000"), [], { from: micropool });
          await govPool.voteDelegated(1, wei("125000000000000000000"), [], { from: micropool2 });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });
          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",
            "misc",
            [settings.address],
            [0],
            [getBytesAddSettings([NEW_SETTINGS])]
          );
          await govPool.voteDelegated(2, wei("125000000000000000000"), [], { from: micropool });
          await govPool.voteDelegated(2, wei("125000000000000000000"), [], { from: micropool2 });

          await govPool.execute(2);

          const rewards1 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator1));
          const rewards2 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator2));
          const rewards3 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator3));

          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool, wei("25000000000000000000"), [], { from: delegator3 });

          await govPool.undelegate(micropool2, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool2, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool2, wei("25000000000000000000"), [], { from: delegator3 });

          assert.deepEqual(rewards1, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [wei("40000000000000000000"), wei("40000000000000000000")],
              realRewards: [wei("40000000000000000000"), wei("30000000000000000000")],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [wei("40000000000000000000"), wei("40000000000000000000")],
              realRewards: [wei("40000000000000000000"), wei("30000000000000000000")],
            },
          ]);
          assert.deepEqual(rewards2, rewards1);
          assert.deepEqual(rewards3, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [wei("20000000000000000000"), wei("20000000000000000000")],
              realRewards: [wei("20000000000000000000"), wei("20000000000000000000")],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [wei("20000000000000000000"), wei("20000000000000000000")],
              realRewards: [wei("20000000000000000000"), wei("20000000000000000000")],
            },
          ]);
        });
      });
    });
  });

  describe("ERC721Power", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = await getPoolParameters(nftPower.address);

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    describe("staking", () => {
      let micropool;
      let delegator1;
      let delegator2;

      beforeEach(async () => {
        micropool = SECOND;
        delegator1 = THIRD;
        delegator2 = FOURTH;

        for (let i = 10; i <= 12; i++) {
          await nftPower.safeMint(delegator1, i);
          await nftPower.approve(userKeeper.address, i, { from: delegator1 });
        }

        for (let i = 20; i <= 22; i++) {
          await nftPower.safeMint(delegator2, i);
          await nftPower.approve(userKeeper.address, i, { from: delegator2 });
        }

        await govPool.deposit(delegator1, 0, [10, 11, 12], { from: delegator1 });
        await govPool.deposit(delegator2, 0, [20, 21, 22], { from: delegator2 });

        await govPool.deposit(OWNER, wei("3"), []);
        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
      });

      it("should not give rewards for zero power nfts staking", async () => {
        await govPool.delegate(micropool, 0, [10, 11, 12], { from: delegator1 });
        await govPool.delegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await govPool.voteDelegated(1, 0, [10, 11, 12, 20, 21, 22], { from: micropool });

        await setTime((await getCurrentBlockTime()) + 10000);

        await govPool.undelegate(micropool, 0, [10, 11, 12], { from: delegator1 });
        await govPool.undelegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        const balance1 = await rewardToken.balanceOf(delegator1);
        const balance2 = await rewardToken.balanceOf(delegator2);

        assert.equal(balance1.toFixed(), "0");
        assert.equal(balance2.toFixed(), "0");
      });

      it("should properly divide rewards by deviation", async () => {
        await setNextBlockTime((await getCurrentBlockTime()) + 200);
        await govPool.delegate(micropool, 0, [10, 11, 12], { from: delegator1 });

        await setNextBlockTime((await getCurrentBlockTime()) + 1);
        await govPool.delegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await govPool.voteDelegated(1, 0, [10, 11, 12, 20, 21, 22], { from: micropool });

        await setNextBlockTime((await getCurrentBlockTime()) + 1000);
        await govPool.undelegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await setNextBlockTime((await getCurrentBlockTime()) + 4465);
        await govPool.undelegate(micropool, 0, [10, 11, 12], { from: delegator1 });

        const balance1 = await rewardToken.balanceOf(delegator1);
        const balance2 = await rewardToken.balanceOf(delegator2);

        assertNoZerosBalanceDistribution([balance1, balance2], [1, 2]);
      });
    });
  });

  describe("saveOffchainResults", () => {
    const OWNER_PRIVATE_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const NOT_OWNER_PRIVATE_KEY = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    beforeEach("setup", async () => {
      const POOL_PARAMETERS = await getPoolParameters(nft.address);

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    it("should correctly add results hash", async () => {
      const resultsHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
      const privateKey = Buffer.from(OWNER_PRIVATE_KEY, "hex");

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      const treasury = await contractsRegistry.getTreasuryContract();

      assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

      await govPool.saveOffchainResults(resultsHash, signature);

      assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("1"));

      const storedHash = await govPool.getOffchainResultsHash();

      assert.deepEqual(resultsHash, storedHash);
    });

    it("should claim offchain rewards", async () => {
      const resultsHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
      const privateKey = Buffer.from(OWNER_PRIVATE_KEY, "hex");

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      await govPool.saveOffchainResults(resultsHash, signature);

      const rewards = await govPool.getPendingRewards(OWNER, []);

      assert.deepEqual(rewards.onchainRewards, []);
      assert.deepEqual(rewards.offchainTokens, [rewardToken.address]);
      assert.deepEqual(
        rewards.offchainRewards.map((e) => toBN(e).toFixed()),
        [wei("5")]
      );

      assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), "0");

      await govPool.claimRewards([0]);

      assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), wei("5"));
    });

    it("should not transfer commission if treasury is address(this)", async () => {
      const resultsHash = "";
      const privateKey = Buffer.from(OWNER_PRIVATE_KEY, "hex");

      await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), govPool.address);

      await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      const balance = await rewardToken.balanceOf(govPool.address);

      await govPool.saveOffchainResults(resultsHash, signature);

      assert.equal((await rewardToken.balanceOf(govPool.address)).toFixed(), balance.toFixed());
    });

    it("should revert when signer is not verifier", async () => {
      const resultsHash = "IPFS";
      const privateKey = Buffer.from(NOT_OWNER_PRIVATE_KEY, "hex");

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      await truffleAssert.reverts(govPool.saveOffchainResults(resultsHash, signature), "Gov: invalid signer");
    });

    it("should revert if same signHash is used", async () => {
      const resultsHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
      const privateKey = Buffer.from(OWNER_PRIVATE_KEY, "hex");

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      await govPool.saveOffchainResults(resultsHash, signature);
      await truffleAssert.reverts(govPool.saveOffchainResults(resultsHash, signature), "Gov: already used");
    });
  });

  describe("pool with babt feature", () => {
    const REVERT_STRING = "Gov: not BABT holder";

    beforeEach("setup", async () => {
      const POOL_PARAMETERS = await getPoolParameters(nft.address);
      POOL_PARAMETERS.onlyBABTHolders = true;

      await babt.attest(SECOND);

      await deployPool(POOL_PARAMETERS);

      await setupTokens();

      await token.mint(SECOND, wei("100000000000000000000"));
      await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

      await govPool.deposit(SECOND, wei("3"), [], { from: SECOND });
    });

    describe("onlyBABTHolder modifier reverts", () => {
      it("createProposal()", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)]),
          REVERT_STRING
        );
      });

      it("vote()", async () => {
        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.vote(1, wei("100"), []), REVERT_STRING);
      });

      it("voteDelegated()", async () => {
        await govPool.deposit(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.delegate(OWNER, wei("500"), [], { from: SECOND });
        await govPool.createProposal("example.com", "misc", [SECOND], [0], [getBytesApprove(SECOND, 1)], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.voteDelegated(1, wei("100"), []), REVERT_STRING);
      });

      it("deposit()", async () => {
        await truffleAssert.reverts(govPool.deposit(SECOND, wei("1000"), []), REVERT_STRING);
      });

      it("withdraw()", async () => {
        await truffleAssert.reverts(govPool.withdraw(SECOND, wei("1000"), []), REVERT_STRING);
      });

      it("delegate()", async () => {
        await truffleAssert.reverts(govPool.delegate(OWNER, wei("500"), []), REVERT_STRING);
      });

      it("undelegate()", async () => {
        await truffleAssert.reverts(govPool.undelegate(OWNER, wei("500"), []), REVERT_STRING);
      });

      it("unlock()", async () => {
        await truffleAssert.reverts(govPool.unlock(OWNER, false), REVERT_STRING);
      });

      it("unlockInProposals()", async () => {
        await truffleAssert.reverts(govPool.unlockInProposals([1], OWNER, false), REVERT_STRING);
      });

      it("execute()", async () => {
        await truffleAssert.reverts(govPool.execute(1), REVERT_STRING);
      });

      it("claimRewards()", async () => {
        await truffleAssert.reverts(govPool.claimRewards([1]), REVERT_STRING);
      });

      it("saveOffchainResults()", async () => {
        await truffleAssert.reverts(
          govPool.saveOffchainResults(
            "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d",
            "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d"
          ),
          REVERT_STRING
        );
      });
    });
  });
});
