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
  getBytesTransfer,
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
  getBytesSetCreditInfo,
  getBytesMintExpertNft,
  getBytesDelegateTreasury,
  getBytesUndelegateTreasury,
  getBytesGovDelegate,
  getBytesChangeVotePower,
  getBytesGovWithdraw,
  getBytesBurnExpertNft,
} = require("../utils/gov-pool-utils");
const {
  getBytesChangeInternalBalances,
  getBytesChangeValidatorSettings,
  getBytesMonthlyWithdraw,
} = require("../utils/gov-validators-utils");
const { ZERO_ADDR, ETHER_ADDR, PRECISION, PERCENTAGE_100 } = require("../../scripts/utils/constants");
const {
  ProposalState,
  DEFAULT_CORE_PROPERTIES,
  ValidatorsProposalState,
  ProposalType,
  VoteType,
} = require("../utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("../helpers/block-helper");
const { impersonate } = require("../helpers/impersonator");
const { assert } = require("chai");
const ethSigUtil = require("@metamask/eth-sig-util");

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
const LinearPower = artifacts.require("LinearPower");
const VotePowerMock = artifacts.require("VotePowerMock");
const ERC721Power = artifacts.require("ERC721Power");
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC20 = artifacts.require("ERC20");
const BABTMock = artifacts.require("BABTMock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");
const GovPoolAttackerMock = artifacts.require("GovPoolAttackerMock");
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
DistributionProposal.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC721Expert.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC20.numberFormat = "BigNumber";
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
  let expertNft;
  let dexeExpertNft;
  let validators;
  let userKeeper;
  let dp;
  let votePower;
  let govPool;

  let attacker;

  const reverter = new Reverter();

  const getProposalByIndex = async (index) => (await govPool.getProposals(index - 1, 1))[0].proposal;

  async function depositAndVote(
    proposalId,
    depositAmount,
    depositNftIds,
    voteAmount,
    voteNftIds,
    from,
    isVoteFor = true
  ) {
    await govPool.multicall(
      [
        getBytesGovDeposit(depositAmount, depositNftIds),
        getBytesGovVote(proposalId, voteAmount, voteNftIds, isVoteFor),
      ],
      { from: from }
    );
  }

  async function executeAndClaim(proposalId, from) {
    await govPool.multicall([getBytesGovExecute(proposalId), getBytesGovClaimRewards([proposalId], from)], {
      from: from,
    });
  }

  async function createInternalProposal(proposalType, description, amounts, users, from) {
    let data;
    switch (proposalType) {
      case ProposalType.ChangeSettings:
        data = getBytesChangeValidatorSettings(amounts);
        break;
      case ProposalType.ChangeBalances:
        data = getBytesChangeInternalBalances(amounts, users);
        break;
      case ProposalType.MonthlyWithdraw:
        data = getBytesMonthlyWithdraw(users.slice(0, users.length - 1), amounts, users[users.length - 1]);
        break;
      case ProposalType.OffchainProposal:
        data = "0x";
        break;
      default:
        assert.isTrue(false);
    }
    await validators.createInternalProposal(proposalType, description, data, { from: from });
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

    contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    dexeExpertNft = await ERC721Expert.new();
    babt = await BABTMock.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");
    attacker = await GovPoolAttackerMock.new();

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

    await contractsRegistry.addContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), dexeExpertNft.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babt.address);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await poolRegistry.__OwnablePoolContractsRegistry_init();
    await dexeExpertNft.__ERC721Expert_init("Global", "Global");

    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  async function deployPool(poolParams) {
    const NAME = await poolRegistry.GOV_POOL_NAME();

    const settings = await GovSettings.new();
    const validators = await GovValidators.new();
    const userKeeper = await GovUserKeeper.new();
    const dp = await DistributionProposal.new();
    const expertNft = await ERC721Expert.new();
    const votePower = await LinearPower.new();
    const govPool = await GovPool.new();
    const nftMultiplier = await ERC721Multiplier.new();

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

    await nftMultiplier.__ERC721Multiplier_init("Mock Multiplier Nft", "MCKMULNFT");
    await dp.__DistributionProposal_init(govPool.address);
    await expertNft.__ERC721Expert_init("Mock Expert Nft", "MCKEXPNFT");
    await votePower.__LinearPower_init();
    await govPool.__GovPool_init(
      [
        settings.address,
        userKeeper.address,
        validators.address,
        expertNft.address,
        nftMultiplier.address,
        votePower.address,
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
    await votePower.transferOwnership(govPool.address);

    await poolRegistry.addProxyPool(NAME, govPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);

    return {
      settings: settings,
      validators: validators,
      userKeeper: userKeeper,
      distributionProposal: dp,
      expertNft: expertNft,
      votePower: votePower,
      govPool: govPool,
      nftMultiplier: nftMultiplier,
    };
  }

  async function getPoolParameters(nftAddress) {
    return {
      settingsParams: {
        proposalSettings: [
          {
            earlyCompletion: false,
            delegatedVotingAllowed: false,
            validatorsVote: true,
            duration: 700,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minVotesForVoting: nftAddress === nftPower.address ? 0 : wei("20"),
            minVotesForCreating: wei("3"),
            executionDelay: 0,
            rewardsInfo: {
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
            },
            executorDescription: "default",
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
            minVotesForCreating: wei("2"),
            executionDelay: 0,
            rewardsInfo: {
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
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
            minVotesForCreating: wei("2"),
            executionDelay: 0,
            rewardsInfo: {
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
            },
            executorDescription: "validators",
          },
          {
            earlyCompletion: false,
            delegatedVotingAllowed: true,
            validatorsVote: true,
            duration: 600,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minVotesForVoting: wei("20"),
            minVotesForCreating: wei("3"),
            executionDelay: 0,
            rewardsInfo: {
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteRewardsCoefficient: PRECISION.toFixed(),
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
        tokenAddress: token.address,
        nftAddress: nftAddress,
        totalPowerInTokens: wei("33000"),
        nftsTotalSupply: 33,
      },
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

    for (let i = 1; i < 11; i++) {
      await nft.mint(OWNER, i);
      await nft.approve(userKeeper.address, i);
    }

    await rewardToken.mint(govPool.address, wei("10000000000000000000000"));
  }

  async function setNftMultiplierAddress(nftMultiplierAddress) {
    await executeValidatorProposal([[govPool.address, 0, getBytesSetNftMultiplierAddress(nftMultiplierAddress)]]);
  }

  async function delegateTreasury(delegatee, amount, nftIds) {
    if (!(await govPool.getExpertStatus(delegatee))) {
      await executeValidatorProposal([[expertNft.address, 0, getBytesMintExpertNft(delegatee, "URI")]]);
    }

    await token.mint(govPool.address, amount);

    for (let i of nftIds) {
      await nft.mint(govPool.address, i);
    }

    await executeValidatorProposal([[govPool.address, 0, getBytesDelegateTreasury(delegatee, amount, nftIds)]]);
  }

  async function undelegateTreasury(delegatee, amount, nftIds) {
    await executeValidatorProposal([[govPool.address, 0, getBytesUndelegateTreasury(delegatee, amount, nftIds)]]);
  }

  async function tokenBalance(user) {
    const balance = await userKeeper.tokenBalance(user, VoteType.PersonalVote);

    return toBN(balance[0]).minus(balance[1]);
  }

  async function succeedProposal(actionsFor, actionsAgainst = [], isVoteFor = true) {
    const executorSettings = await settings.getExecutorSettings(actionsFor[actionsFor.length - 1][0]);

    await govPool.createProposal("example.com", actionsFor, actionsAgainst);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, isVoteFor, await tokenBalance(SECOND), [], { from: SECOND });

    if (!executorSettings.earlyCompletion) {
      await setTime((await getCurrentBlockTime()) + 999);
    }

    return proposalId;
  }

  async function succeedValidatorProposal(actionsFor, actionsAgainst = [], isVoteFor = true) {
    const executorSettings = await settings.getExecutorSettings(actionsFor[actionsFor.length - 1][0]);

    await govPool.createProposal("example.com", actionsFor, actionsAgainst);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, isVoteFor, await tokenBalance(SECOND), [], { from: SECOND });

    if (!executorSettings.earlyCompletion) {
      await setTime((await getCurrentBlockTime()) + 999);
    }

    await govPool.moveProposalToValidators(proposalId);

    if (executorSettings.quorumValidators === PRECISION.times("100").toFixed()) {
      await validators.voteExternalProposal(proposalId, wei("100"), true);
    }

    await validators.voteExternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });

    return proposalId;
  }

  async function executeProposal(actionsFor, actionsAgainst = [], isVoteFor = true) {
    const proposalId = await succeedProposal(actionsFor, actionsAgainst, isVoteFor);

    await govPool.execute(proposalId);
  }

  async function executeValidatorProposal(actionsFor, actionsAgainst = [], isVoteFor = true) {
    const proposalId = await succeedValidatorProposal(actionsFor, actionsAgainst, isVoteFor);

    await govPool.execute(proposalId);
  }

  describe("Fullfat GovPool", () => {
    let POOL_PARAMETERS;

    async function changeInternalSettings(validatorsVote, minVotingPower) {
      let GOV_POOL_SETTINGS = JSON.parse(JSON.stringify(POOL_PARAMETERS.settingsParams.proposalSettings[1]));
      GOV_POOL_SETTINGS.validatorsVote = validatorsVote;

      if (minVotingPower != null) {
        GOV_POOL_SETTINGS.minVotesForVoting = minVotingPower;
      }

      await executeValidatorProposal(
        [
          [settings.address, 0, getBytesAddSettings([GOV_POOL_SETTINGS])],
          [settings.address, 0, getBytesChangeExecutors([govPool.address, settings.address], [4, 4])],
        ],
        []
      );
    }

    beforeEach("setup", async () => {
      POOL_PARAMETERS = await getPoolParameters(nft.address);

      let poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;
      votePower = poolContracts.votePower;
      nftMultiplier = poolContracts.nftMultiplier;

      await setupTokens();
    });

    describe("init()", () => {
      it("should correctly set all parameters", async () => {
        const contracts = await govPool.getHelperContracts();

        assert.equal(contracts.settings, settings.address);
        assert.equal(contracts.userKeeper, userKeeper.address);
        assert.equal(contracts.validators, validators.address);
        assert.equal(contracts.poolRegistry, poolRegistry.address);
      });
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          govPool.__GovPool_init(
            [
              settings.address,
              userKeeper.address,
              validators.address,
              expertNft.address,
              nftMultiplier.address,
              votePower.address,
            ],
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
        await truffleAssert.reverts(govPool.setDependencies(OWNER, "0x"), "Dependant: not an injector");
      });
    });

    describe("deposit()", () => {
      it("should not deposit zero tokens", async () => {
        await truffleAssert.reverts(govPool.deposit(0, []), "Gov: empty deposit");
      });

      it("should deposit tokens", async () => {
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("100000000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("100000000000")
        );

        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(), "10");
        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(), "10");

        await govPool.deposit(wei("100"), [1, 2, 3]);

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("100000000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("99999999900")
        );

        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(), "10");
        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(), "7");
      });
    });

    describe("unlock()", () => {
      beforeEach("setup", async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should unlock when Locked status", async () => {
        let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
        DEFAULT_SETTINGS.executionDelay = "1000";

        await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

        await succeedValidatorProposal([[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await setTime((await getCurrentBlockTime()) + 5);

        assert.equal((await govPool.getProposalState(2)).toFixed(), ProposalState.Locked);
        assert.equal((await govPool.getUserActiveProposalsCount(SECOND)).toFixed(), "1");

        await govPool.unlock(SECOND);

        assert.equal((await govPool.getProposalState(2)).toFixed(), ProposalState.Locked);
        assert.equal((await govPool.getUserActiveProposalsCount(SECOND)).toFixed(), "0");
      });

      it("should unlock all", async () => {
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("example.com", [[THIRD, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("100"), [2]);
        await govPool.vote(2, true, wei("50"), []);

        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(beforeUnlock.tokens.toFixed(), wei("900"));
        assert.deepEqual(
          beforeUnlock.nfts.map((e) => e.toFixed()),
          ["1", "3", "4", "5", "6", "7", "8", "9"]
        );

        await setTime((await getCurrentBlockTime()) + 1000);

        assert.equal((await govPool.getUserActiveProposalsCount(OWNER)).toFixed(), "2");

        await govPool.unlock(OWNER);

        assert.equal((await govPool.getUserActiveProposalsCount(OWNER)).toFixed(), "0");

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(afterUnlock.tokens.toFixed(), wei("1000"));
        assert.deepEqual(
          afterUnlock.nfts.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
        );
      });

      it("should unlock proper proposal types", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal("", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await govPool.createProposal(
          "",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        for (let proposalId = 4; proposalId <= 6; ++proposalId) {
          await govPool.createProposal(
            "",
            [[govPool.address, 0, getBytesGovVote(3, wei("100"), [], true)]],
            [[govPool.address, 0, getBytesGovVote(3, wei("100"), [], false)]]
          );
        }

        for (let proposalId = 7; proposalId <= 8; ++proposalId) {
          await govPool.createProposal("", [[govPool.address, 0, getBytesGovVote(3, wei("100"), [], true)]], []);
        }

        await govPool.vote(4, true, 0, [4]);
        await govPool.vote(5, true, 0, [5]);
        await govPool.vote(6, true, 0, [6]);
        await govPool.vote(7, true, 0, [7]);
        await govPool.vote(8, true, 0, [8]);
        await govPool.vote(9, true, 0, [9]);

        assert.deepEqual(
          (await govPool.getWithdrawableAssets(OWNER)).nfts.map((e) => e.toFixed()),
          ["1", "2", "3"]
        );

        await govPool.vote(4, true, wei("100000000000000000000"), [], { from: SECOND });
        await govPool.execute(4);

        await govPool.vote(5, false, wei("100000000000000000000"), [], { from: SECOND });
        await govPool.execute(5);

        await govPool.vote(6, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.vote(7, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.vote(8, false, wei("100000000000000000000"), [], { from: SECOND });

        assert.equal(await govPool.getProposalState(4), ProposalState.ExecutedFor);
        assert.equal(await govPool.getProposalState(5), ProposalState.ExecutedAgainst);
        assert.equal(await govPool.getProposalState(6), ProposalState.SucceededFor);
        assert.equal(await govPool.getProposalState(7), ProposalState.SucceededAgainst);
        assert.equal(await govPool.getProposalState(8), ProposalState.Defeated);
        assert.equal(await govPool.getProposalState(9), ProposalState.Voting);

        assert.deepEqual(
          (await govPool.getWithdrawableAssets(OWNER)).nfts.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "8"]
        );

        assert.equal((await govPool.getUserActiveProposalsCount(OWNER)).toFixed(), "6");

        await govPool.unlock(OWNER);

        assert.equal((await govPool.getUserActiveProposalsCount(OWNER)).toFixed(), "1");
      });
    });

    describe("createProposal()", () => {
      beforeEach("", async () => {
        await govPool.deposit(1, [1]);
      });

      it("should not create proposal with empty actions", async () => {
        await truffleAssert.reverts(govPool.createProposal("example.com", [], []), "Gov: invalid array length");
      });

      it("should not create proposal if insufficient deposited amount", async () => {
        await govPool.withdraw(OWNER, 0, [1]);

        await truffleAssert.reverts(
          govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []),
          "Gov: low creating power"
        );
      });

      it("should create 2 proposals", async () => {
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

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
        assert.equal(proposal.core.settings[9], defaultSettings.executionDelay);

        assert.isFalse(proposal.core.executed);
        assert.equal(proposal.descriptionURL, "example.com");
        assert.deepEqual(proposal.actionsOnFor[0].data, getBytesApprove(SECOND, 1));
        assert.deepEqual(proposal.actionsOnAgainst, []);
        assert.equal((await govPool.getProposalRequiredQuorum(1)).toFixed(), wei("71000023430"));

        await govPool.createProposal("example2.com", [[THIRD, 0, getBytesApprove(SECOND, 2)]], []);
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
        assert.equal(proposal.core.settings[9], defaultSettings.executionDelay);

        assert.isFalse(proposal.core.executed);
        assert.equal(proposal.descriptionURL, "example2.com");
        assert.deepEqual(proposal.actionsOnFor[0].data, getBytesApprove(SECOND, 2));
        assert.deepEqual(proposal.actionsOnAgainst, []);
        assert.equal((await govPool.getProposalRequiredQuorum(2)).toFixed(), wei("71000023430"));

        assert.equal((await govPool.getProposalRequiredQuorum(3)).toFixed(), "0");
      });

      it("should not create proposal due to low voting power", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], { from: SECOND }),
          "Gov: low creating power"
        );
      });

      describe("meta governance", () => {
        beforeEach(async () => {
          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });

          await changeInternalSettings(true);
        });

        describe("meta create", () => {
          it("should not create proposal due to different length", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid actions length"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                [
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid actions length"
            );
          });
        });

        describe("vote", () => {
          it("should not create proposal due invalid executor", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                [[SECOND, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[SECOND, 0, getBytesGovVote(1, wei("1"), [], true)]],
                [[SECOND, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );
          });

          it("should not create proposal due to invalid selector", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovExecute(1)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid selector"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovExecute(1)]],
                [[govPool.address, 0, getBytesGovExecute(1)]],
                { from: SECOND }
              ),
              "Gov: invalid selector"
            );
          });

          it("should not create proposal due to different proposalId", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                [[govPool.address, 0, getBytesGovVote(2, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid proposal id"
            );
          });

          it("should not create proposal due to invalid vote", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                { from: SECOND }
              ),
              "Gov: invalid vote"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid vote"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
                { from: SECOND }
              ),
              "Gov: invalid vote"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("10"), [], true)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid vote amount"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [1], true)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
                { from: SECOND }
              ),
              "Gov: invalid nfts length"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [1], true)]],
                [[govPool.address, 0, getBytesGovVote(1, wei("1"), [2], false)]],
                { from: SECOND }
              ),
              "Gov: invalid nft vote"
            );
          });
        });

        describe("full meta", () => {
          it("should not create proposal with approve and deposit only", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[token.address, 0, getBytesApprove(userKeeper.address, wei("1"))]],
                [[token.address, 0, getBytesApprove(userKeeper.address, wei("1"))]],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [[govPool.address, 0, getBytesGovDeposit(wei("1"), [])]],
                [[govPool.address, 0, getBytesGovDeposit(wei("1"), [])]],
                { from: SECOND }
              ),
              "Gov: invalid selector"
            );
          });

          it("should not create proposal with wrong executor before vote", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesTransfer(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesTransfer(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid selector"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesTransfer(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesTransfer(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: selector not supported"
            );
          });

          it("should create fullfat meta proposal", async () => {
            await truffleAssert.passes(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [nft.address, 0, getBytesApprove(userKeeper.address, 1)],
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [1])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [1], true)],
                ],
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [nft.address, 0, getBytesApprove(userKeeper.address, 1)],
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [1])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [1], false)],
                ],
                { from: SECOND }
              )
            );
          });
        });

        describe("approve", () => {
          it("should not create proposal with wrong executor", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [govPool.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );
          });

          it("should not create proposal with wrong spender", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesApprove(token.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid spender"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesApprove(token.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid spender"
            );
          });

          it("should not create proposal with wrong approval amount", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("1"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesApprove(userKeeper.address, wei("10"))],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid amount"
            );
          });
        });

        describe("setApprovalForAll", () => {
          it("should not create proposal with wrong executor", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [govPool.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );
          });

          it("should not create proposal with wrong operator", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [nft.address, 0, getBytesApproveAll(nft.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid operator"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [nft.address, 0, getBytesApproveAll(nft.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid operator"
            );
          });

          it("should not create with wrong approval", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, true)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [nft.address, 0, getBytesApproveAll(userKeeper.address, false)],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid approve"
            );
          });
        });

        describe("deposit", () => {
          it("should not create proposal with wrong executor", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [token.address, 0, getBytesGovDeposit(wei("1"), [])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [token.address, 0, getBytesGovDeposit(wei("1"), [])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid executor"
            );
          });

          it("should not create proposal with invalid deposit", async () => {
            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("10"), [])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid amount"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [1])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid nfts length"
            );

            await truffleAssert.reverts(
              govPool.createProposal(
                "",
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [1])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                ],
                [
                  [govPool.address, 0, getBytesGovDeposit(wei("1"), [2])],
                  [govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                ],
                { from: SECOND }
              ),
              "Gov: invalid nft deposit"
            );
          });
        });
      });

      describe("exempted treasury", () => {
        const calculateNewQuorum = async (quorum, exemptedTreasury) => {
          const totalVoteWeight = await userKeeper.getTotalVoteWeight();

          const newTotalVoteWeight = totalVoteWeight.minus(exemptedTreasury).multipliedBy(quorum).idiv(PERCENTAGE_100);

          return PERCENTAGE_100.multipliedBy(newTotalVoteWeight).idiv(totalVoteWeight);
        };

        beforeEach(async () => {
          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
        });

        it("should decrease quorum by exempted treasury", async () => {
          await delegateTreasury(THIRD, wei("10000000000000000000"), []);
          await delegateTreasury(FOURTH, wei("10000000000000000000"), []);

          const defaultQuorum = toBN(POOL_PARAMETERS.settingsParams.proposalSettings[0].quorum);
          const internalQuorum = toBN(POOL_PARAMETERS.settingsParams.proposalSettings[1].quorum);

          await govPool.createProposal("", [[govPool.address, 0, getBytesDelegateTreasury(THIRD, wei("1"), [])]], []);

          assert.equal(
            (await getProposalByIndex(5)).core.settings.quorum,
            (await calculateNewQuorum(internalQuorum, wei("10000000000000000000"))).toFixed()
          );

          await govPool.createProposal("", [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, wei("1"), [])]], []);

          assert.equal(
            (await getProposalByIndex(6)).core.settings.quorum,
            (await calculateNewQuorum(internalQuorum, wei("10000000000000000000"))).toFixed()
          );

          await govPool.createProposal("", [[expertNft.address, 0, getBytesBurnExpertNft(FOURTH)]], []);

          assert.equal(
            (await getProposalByIndex(7)).core.settings.quorum,
            (await calculateNewQuorum(defaultQuorum, wei("10000000000000000000"))).toFixed()
          );

          await govPool.createProposal("", [[dexeExpertNft.address, 0, getBytesBurnExpertNft(FOURTH)]], []);

          assert.equal(
            (await getProposalByIndex(8)).core.settings.quorum,
            (await calculateNewQuorum(defaultQuorum, wei("10000000000000000000"))).toFixed()
          );

          await govPool.createProposal(
            "",
            [
              [govPool.address, 0, getBytesDelegateTreasury(THIRD, wei("1"), [])],
              [govPool.address, 0, getBytesDelegateTreasury(FOURTH, wei("1"), [])],
            ],
            []
          );

          assert.equal(
            (await getProposalByIndex(9)).core.settings.quorum,
            (await calculateNewQuorum(internalQuorum, wei("20000000000000000000"))).toFixed()
          );

          await govPool.createProposal(
            "",
            [
              [govPool.address, 0, getBytesDelegateTreasury(THIRD, wei("1"), [])],
              [govPool.address, 0, getBytesDelegateTreasury(THIRD, wei("1"), [])],
            ],
            []
          );

          assert.equal(
            (await getProposalByIndex(10)).core.settings.quorum,
            (await calculateNewQuorum(internalQuorum, wei("10000000000000000000"))).toFixed()
          );
        });
      });

      it("should create proposal if user is Expert even due to low voting power", async () => {
        await dexeExpertNft.mint(SECOND, "");

        await truffleAssert.passes(
          govPool.createProposal("", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], { from: SECOND })
        );
      });

      describe("validators", () => {
        it("should not create validators proposal if executors > 1", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [
                [settings.address, 0, getBytesAddSettings([POOL_PARAMETERS.settingsParams.proposalSettings[2]])],
                [validators.address, 0, getBytesChangeBalances([wei("10")], [THIRD])],
              ],
              []
            ),
            "Gov: invalid executors length"
          );
        });

        it("should revert when creating validator proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [[validators.address, 1, getBytesChangeBalances([wei("10")], [THIRD])]],
              []
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
              [
                [settings.address, 0, getBytesAddSettings([POOL_PARAMETERS.settingsParams.proposalSettings[2]])],
                [userKeeper.address, 0, getBytesSetERC20Address(token.address)],
                [userKeeper.address, 0, getBytesSetERC721Address(token.address, wei("1"), 1)],
              ],
              []
            ),
            "pass"
          );
        });

        it("should revert when creating internal proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [[settings.address, 1, getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.proposalSettings[0]])]],
              []
            ),
            "Gov: invalid internal data"
          );

          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              [[settings.address, 0, getBytesEditSettings([4], [POOL_PARAMETERS.settingsParams.proposalSettings[0]])]],
              []
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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
          },
          executorDescription: "new_settings",
        };

        beforeEach("setup", async () => {
          await govPool.createProposal(
            "example.com",

            [
              [settings.address, 0, getBytesAddSettings([NEW_SETTINGS])],
              [settings.address, 0, getBytesChangeExecutors([THIRD], [4])],
            ],
            []
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await depositAndVote(1, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(1, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(1);

          await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

          await govPool.execute(1);
        });

        it("should create trusted proposal", async () => {
          await govPool.createProposal(
            "example.com",

            [
              [THIRD, 0, getBytesApprove(OWNER, 1)],
              [THIRD, 0, getBytesApproveAll(OWNER, true)],
            ],
            []
          );

          const proposal = await getProposalByIndex(2);

          assert.equal(toBN(proposal.core.settings.quorum).toFixed(), NEW_SETTINGS.quorum);
        });

        it("should create default proposal", async () => {
          await govPool.createProposal(
            "example.com",
            [
              [SECOND, 0, getBytesAddSettings([NEW_SETTINGS])],
              [THIRD, 0, getBytesAddSettings([NEW_SETTINGS])],
            ],
            []
          );

          const proposal = await getProposalByIndex(2);

          assert.equal(
            toBN(proposal.core.settings.quorum).toFixed(),
            POOL_PARAMETERS.settingsParams.proposalSettings[0].quorum
          );
        });
      });
    });

    describe("vote()", () => {
      beforeEach(async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should not vote if vote unavailable", async () => {
        await truffleAssert.reverts(
          govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND }),
          "Gov: vote unavailable"
        );
      });

      it("should not vote if need cancel", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("100"), [], { from: SECOND });

        await truffleAssert.reverts(govPool.vote(1, true, wei("100"), [], { from: SECOND }), "Gov: need cancel");
      });

      it("should not not vote if wrong vote amount", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await truffleAssert.reverts(
          govPool.vote(1, true, wei("1000000000000000000000"), [], { from: SECOND }),
          "Gov: wrong vote amount"
        );
      });

      it("should not vote if NFT already voted", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await truffleAssert.reverts(govPool.vote(1, true, wei("20"), [1, 1]), "Gov: NFT already voted");
      });

      it("should not vote if low voting power", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await truffleAssert.reverts(govPool.vote(1, true, wei("19"), [], { from: SECOND }), "Gov: low voting power");
      });

      it("should not vote if votes limit reached", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await coreProperties.setGovVotesLimit(0);

        await truffleAssert.reverts(govPool.vote(1, true, wei("100"), []), "Gov: vote limit reached");
      });

      it("should not vote if delegate-vote-undelegate flashloan", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.withdraw(attacker.address, wei("100000000000000000000"), [], { from: SECOND });

        await truffleAssert.reverts(
          attacker.attackDelegateUndelegate(govPool.address, token.address, 2),
          "BlockGuard: locked"
        );
      });

      it("should not vote if delegate-vote-undelegate treasury flashloan", async () => {
        await executeValidatorProposal([[expertNft.address, 0, getBytesMintExpertNft(SECOND, "URI")]]);

        await token.transfer(govPool.address, wei("1"));

        await impersonate(govPool.address);

        await truffleAssert.reverts(
          govPool.multicall(
            [getBytesDelegateTreasury(SECOND, wei("1"), []), getBytesUndelegateTreasury(SECOND, wei("1"), [])],
            { from: govPool.address }
          ),
          "BlockGuard: locked"
        );
      });

      it("should vote for if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("20"), [], { from: SECOND });

        const totalVotes = await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote);

        assert.equal(totalVotes[0].toFixed(), wei("20"));
        assert.equal(totalVotes[1].toFixed(), "0");
        assert.equal(totalVotes[2].toFixed(), wei("20"));
        assert.isTrue(totalVotes[3]);
      });

      it("should vote against if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, false, wei("20"), [], { from: SECOND });

        const totalVotes = await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote);

        assert.equal(totalVotes[0].toFixed(), "0");
        assert.equal(totalVotes[1].toFixed(), wei("20"));
        assert.equal(totalVotes[2].toFixed(), wei("20"));
        assert.isFalse(totalVotes[3]);
      });

      it("should vote for if all conditions are met with nfts", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, 0, [1, 2]);

        const totalVotes = await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote);

        assert.equal(totalVotes[0].toFixed(), wei("6600"));
        assert.equal(totalVotes[1].toFixed(), "0");
        assert.equal(totalVotes[2].toFixed(), wei("6600"));
        assert.isTrue(totalVotes[3]);
      });

      it("should vote against if all conditions are met with nfts", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, false, 0, [1, 2]);

        const totalVotes = await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote);

        assert.equal(totalVotes[0].toFixed(), "0");
        assert.equal(totalVotes[1].toFixed(), wei("6600"));
        assert.equal(totalVotes[2].toFixed(), wei("6600"));
        assert.isFalse(totalVotes[3]);
      });

      describe("zero power vote", () => {
        beforeEach(async () => {
          let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
          DEFAULT_SETTINGS.minVotesForVoting = "0";

          await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

          for (let i = 1; i < 11; i++) {
            await nft.burn(i);
          }
        });

        it("should vote with zero personal power", async () => {
          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await nft.mint(SECOND, 1);
          await nft.approve(userKeeper.address, 1, { from: SECOND });

          await govPool.deposit(0, [1], { from: SECOND });

          await govPool.vote(2, true, 0, [1], { from: SECOND });

          let vote = await govPool.getUserVotes(2, SECOND, VoteType.PersonalVote);

          assert.isTrue(vote.isVoteFor);
          assert.equal(vote.totalRawVoted, "0");
        });

        it("should vote with zero micropool power", async () => {
          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await nft.mint(OWNER, 1);
          await nft.approve(userKeeper.address, 1);

          await govPool.deposit(0, [1]);

          await govPool.delegate(SECOND, 0, [1]);

          await govPool.vote(2, true, 0, [], { from: SECOND });

          let vote = await govPool.getUserVotes(2, SECOND, VoteType.MicropoolVote);

          assert.isTrue(vote.isVoteFor);
          assert.equal(vote.totalRawVoted, "0");
        });

        it("should vote with zero micropool power", async () => {
          await executeValidatorProposal([[expertNft.address, 0, getBytesMintExpertNft(SECOND, "URI")]]);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await delegateTreasury(SECOND, 0, [1]);

          await govPool.vote(3, true, 0, [], { from: SECOND });

          let vote = await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote);

          assert.isTrue(vote.isVoteFor);
          assert.equal(vote.totalRawVoted, "0");
        });
      });

      describe("voteMicropool & revoteDelegated", () => {
        let perNftPower;

        let delegator1;
        let delegator2;

        beforeEach(async () => {
          delegator1 = FIFTH;
          delegator2 = SIXTH;

          await token.mint(delegator1, wei("6000000000000000000"));
          await token.mint(delegator2, wei("6000000000000000000"));

          await token.approve(userKeeper.address, wei("6000000000000000000"), { from: delegator1 });
          await token.approve(userKeeper.address, wei("6000000000000000000"), { from: delegator2 });

          for (let i = 100; i < 102; i++) {
            await nft.mint(delegator1, i);
            await nft.approve(userKeeper.address, i, { from: delegator1 });
          }

          for (let i = 200; i < 204; i++) {
            await nft.mint(delegator2, i);
            await nft.approve(userKeeper.address, i, { from: delegator2 });
          }

          perNftPower = toBN(wei("33000")).idiv(16);

          await govPool.deposit(wei("6000000000000000000"), [100, 101], { from: delegator1 });
          await govPool.deposit(wei("6000000000000000000"), [200, 201, 202, 203], { from: delegator2 });
        });

        it("should voteMicropool if all conditions are met", async () => {
          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(SECOND, wei("1000000000000000000"), [100], { from: delegator1 });
          await govPool.delegate(SECOND, wei("1000000000000000000"), [200], { from: delegator2 });

          await govPool.vote(1, true, wei("68000000000000000000"), [], { from: SECOND });

          assert.equal(
            (await govPool.getUserVotes(1, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal(
            (await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote)).totalRawVoted,
            toBN(wei("2000000000000000000")).plus(perNftPower.multipliedBy(2)).toFixed()
          );
          assert.equal(
            (await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote))[0].toFixed(),
            toBN(wei("70000000000000000000")).plus(perNftPower.multipliedBy(2)).toFixed()
          );

          await govPool.delegate(SECOND, wei("5000000000000000000"), [101], { from: delegator1 });
          await govPool.delegate(SECOND, wei("5000000000000000000"), [201, 202, 203], { from: delegator2 });

          assert.equal(
            (await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote)).totalRawVoted,
            toBN(wei("12000000000000000000")).plus(perNftPower.multipliedBy(6)).toFixed()
          );
          assert.equal(
            (await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote))[0].toFixed(),
            toBN(wei("80000000000000000000")).plus(perNftPower.multipliedBy(6)).toFixed()
          );

          await setTime((await getCurrentBlockTime()) + 999);

          assert.equal(await govPool.getProposalState(1), ProposalState.WaitingForVotingTransfer);
        });

        it("should voteMicropool after quorum reached", async () => {
          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(SECOND, wei("6000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(SECOND, wei("6000000000000000000"), [], { from: delegator2 });

          await govPool.vote(1, true, wei("68000000000000000000"), [], { from: SECOND });

          let core = (await govPool.getProposals(0, 1))[0].proposal.core;

          assert.equal(core.executeAfter, core.voteEnd);

          await govPool.undelegate(SECOND, wei("6000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(SECOND, wei("6000000000000000000"), [], { from: delegator2 });

          core = (await govPool.getProposals(0, 1))[0].proposal.core;

          assert.equal(core.executeAfter, "0");

          await govPool.delegate(SECOND, wei("6000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(SECOND, wei("6000000000000000000"), [], { from: delegator2 });

          core = (await govPool.getProposals(0, 1))[0].proposal.core;

          assert.equal(core.executeAfter, core.voteEnd);
        });

        it("should voteMicropool with zero personal balance", async () => {
          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(THIRD, wei("6000000000000000000"), [100], { from: delegator1 });
          await govPool.delegate(THIRD, wei("6000000000000000000"), [], { from: delegator2 });

          await govPool.vote(1, true, "0", [], { from: THIRD });
          await govPool.vote(1, true, wei("68000000000000000000"), [], { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 999);

          assert.equal(await govPool.getProposalState(1), ProposalState.WaitingForVotingTransfer);

          await govPool.undelegate(THIRD, "0", [100], { from: delegator1 });
          await govPool.undelegate(THIRD, wei("6000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(THIRD, wei("6000000000000000000"), [], { from: delegator2 });

          assert.equal(await govPool.getProposalState(1), ProposalState.WaitingForVotingTransfer);
        });

        it("should not voteMicropool if delegated voting is on", async () => {
          let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
          DEFAULT_SETTINGS.delegatedVotingAllowed = true;

          await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(SECOND, wei("1000000000000000000"), [100], { from: delegator1 });
          await govPool.delegate(SECOND, wei("1000000000000000000"), [200, 201], { from: delegator2 });

          await govPool.vote(2, true, wei("68000000000000000000"), [], { from: SECOND });

          assert.equal(
            (await govPool.getUserVotes(2, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal((await govPool.getUserVotes(2, SECOND, VoteType.MicropoolVote)).totalRawVoted, "0");
          assert.equal(
            (await govPool.getTotalVotes(2, SECOND, VoteType.PersonalVote))[0].toFixed(),
            wei("68000000000000000000")
          );

          await truffleAssert.reverts(govPool.getTotalVotes(2, SECOND, VoteType.DelegatedVote), "Gov: use personal");

          await govPool.delegate(SECOND, wei("5000000000000000000"), [101], { from: delegator1 });
          await govPool.delegate(SECOND, wei("5000000000000000000"), [202, 203], { from: delegator2 });

          assert.equal((await govPool.getUserVotes(2, SECOND, VoteType.MicropoolVote)).totalRawVoted, "0");
          assert.equal(
            (await govPool.getTotalVotes(2, SECOND, VoteType.PersonalVote))[0].toFixed(),
            wei("68000000000000000000")
          );
        });
      });

      describe("voteTreasury & revoteDelegated", () => {
        beforeEach(async () => {
          await executeValidatorProposal([
            [expertNft.address, 0, getBytesMintExpertNft(SECOND, "URI")],
            [expertNft.address, 0, getBytesMintExpertNft(THIRD, "URI")],
          ]);
        });

        it("should voteTreasury if all conditions are met", async () => {
          await delegateTreasury(SECOND, wei("1000000000000000000"), [100]);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.vote(3, true, wei("68000000000000000000"), [], { from: SECOND });

          assert.equal(
            (await govPool.getUserVotes(3, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal(
            (await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote)).totalRawVoted,
            toBN(wei("1000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11))
              .toFixed()
          );
          assert.equal(
            (await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[0].toFixed(),
            toBN(wei("69000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11))
              .toFixed()
          );

          await govPool.createProposal("example.com", [[dexeExpertNft.address, 0, getBytesBurnExpertNft(SECOND)]], []);

          await govPool.vote(4, true, wei("68000000000000000000"), [], { from: SECOND });

          assert.equal(
            (await govPool.getUserVotes(4, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.TreasuryVote)).totalRawVoted, "0");

          await delegateTreasury(SECOND, wei("1000000000000000000"), [101]);

          assert.equal(
            (await govPool.getUserVotes(4, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.TreasuryVote)).totalRawVoted, "0");

          await govPool.cancelVote(4, { from: SECOND });

          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.PersonalVote)).totalRawVoted, "0");
          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.TreasuryVote)).totalRawVoted, "0");

          assert.equal(
            (await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote)).totalRawVoted,
            toBN(wei("2000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11).multipliedBy(2))
              .toFixed()
          );
          assert.equal(
            (await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[0].toFixed(),
            toBN(wei("70000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11).multipliedBy(2))
              .toFixed()
          );

          await delegateTreasury(SECOND, wei("10000000000000000000"), [102, 103]);

          assert.equal(
            (await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote)).totalRawVoted,
            toBN(wei("12000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11).multipliedBy(4))
              .toFixed()
          );
          assert.equal(
            (await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[0].toFixed(),
            toBN(wei("80000000000000000000"))
              .plus(toBN(wei("33000")).idiv(11).multipliedBy(4))
              .toFixed()
          );

          await setTime((await getCurrentBlockTime()) + 999);

          assert.equal(await govPool.getProposalState(3), ProposalState.WaitingForVotingTransfer);
        });

        it("should voteTreasury after quorum reached", async () => {
          await delegateTreasury(THIRD, wei("13000000000000000000"), []);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.vote(3, true, wei("68000000000000000000"), [], { from: SECOND });
          await govPool.vote(3, true, "0", [], { from: THIRD });

          let core = (await govPool.getProposals(2, 1))[0].proposal.core;

          assert.equal(core.executeAfter, core.voteEnd);

          await undelegateTreasury(THIRD, wei("12000000000000000000"), []);

          core = (await govPool.getProposals(2, 1))[0].proposal.core;

          assert.equal(core.executeAfter, "0");

          await executeValidatorProposal([
            [govPool.address, 0, getBytesDelegateTreasury(THIRD, wei("12000000000000000000"), [])],
          ]);

          core = (await govPool.getProposals(2, 1))[0].proposal.core;

          assert.equal(core.executeAfter, core.voteEnd);
        });

        it("should voteTreasury with zero personal balance", async () => {
          await delegateTreasury(THIRD, wei("20000000000000000000"), []);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.vote(3, true, "0", [], { from: THIRD });
          await govPool.vote(3, true, wei("68000000000000000000"), [], { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 999);

          assert.equal(await govPool.getProposalState(3), ProposalState.WaitingForVotingTransfer);

          await undelegateTreasury(THIRD, wei("20000000000000000000"), []);

          assert.equal(await govPool.getProposalState(3), ProposalState.WaitingForVotingTransfer);
        });

        it("should not voteTreasury if delegated voting is on", async () => {
          let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
          DEFAULT_SETTINGS.delegatedVotingAllowed = true;

          await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

          await delegateTreasury(SECOND, wei("1000000000000000000"), [100]);

          await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.vote(4, true, wei("68000000000000000000"), [], { from: SECOND });

          assert.equal(
            (await govPool.getUserVotes(4, SECOND, VoteType.PersonalVote)).totalRawVoted,
            wei("68000000000000000000")
          );
          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.TreasuryVote)).totalRawVoted, "0");
          assert.equal(
            (await govPool.getTotalVotes(4, SECOND, VoteType.TreasuryVote))[0].toFixed(),
            wei("68000000000000000000")
          );

          await delegateTreasury(SECOND, wei("1000000000000000000"), [101]);

          assert.equal((await govPool.getUserVotes(4, SECOND, VoteType.TreasuryVote)).totalRawVoted, "0");
          assert.equal(
            (await govPool.getTotalVotes(4, SECOND, VoteType.TreasuryVote))[0].toFixed(),
            wei("68000000000000000000")
          );
        });
      });
    });

    describe("cancelVote()", () => {
      beforeEach(async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should not cancel if not active", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await truffleAssert.reverts(govPool.cancelVote(1), "Gov: not active");
      });

      it("should not cancel if cancel unavailable", async () => {
        await succeedProposal([[token.address, 0, getBytesApprove(SECOND, 1)]]);

        assert.equal(await govPool.getProposalState(1), ProposalState.WaitingForVotingTransfer);

        await truffleAssert.reverts(govPool.cancelVote(1), "Gov: cancel unavailable");
      });

      it("should cancel personal for if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("100"), []);

        let vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

        assert.isTrue(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, wei("100"));
        assert.equal((await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote))[0].toFixed(), wei("100"));

        await govPool.cancelVote(1);

        vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote))[0].toFixed(), "0");
      });

      it("should cancel micropool for if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.delegate(SECOND, wei("100"), [1, 2]);

        await govPool.vote(1, true, 0, [], { from: SECOND });

        let vote = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

        assert.isTrue(vote.isVoteFor);
        assert.equal(
          vote.totalRawVoted,
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(10).multipliedBy(2))
            .toFixed()
        );
        assert.equal(
          (await govPool.getTotalVotes(1, SECOND, VoteType.MicropoolVote))[0].toFixed(),
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(10).multipliedBy(2))
            .toFixed()
        );

        await govPool.cancelVote(1, { from: SECOND });

        vote = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(1, SECOND, VoteType.MicropoolVote))[0].toFixed(), "0");
      });

      it("should cancel treasury for if all conditions are met", async () => {
        await delegateTreasury(SECOND, wei("100"), [100, 101]);

        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(3, true, wei("100"), [], { from: SECOND });

        let vote = await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote);

        assert.isTrue(vote.isVoteFor);
        assert.equal(
          vote.totalRawVoted,
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );
        assert.equal(
          (await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[0].toFixed(),
          toBN(wei("200"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );

        await govPool.cancelVote(3, { from: SECOND });

        vote = await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[0].toFixed(), "0");
      });

      it("should cancel personal against if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, false, 0, [1, 2, 3, 4]);

        let vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, toBN(wei("33000")).idiv(10).multipliedBy(4).toFixed());
        assert.equal(
          (await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote))[1].toFixed(),
          toBN(wei("33000")).idiv(10).multipliedBy(4).toFixed()
        );

        await govPool.cancelVote(1);

        vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote))[1].toFixed(), "0");
      });

      it("should cancel micropool against if all conditions are met", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.delegate(SECOND, wei("100"), [1, 2]);

        await govPool.vote(1, false, wei("100"), [], { from: SECOND });

        let vote = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(
          vote.totalRawVoted,
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(10).multipliedBy(2))
            .toFixed()
        );
        assert.equal(
          (await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote))[1].toFixed(),
          toBN(wei("200"))
            .plus(toBN(wei("33000")).idiv(10).multipliedBy(2))
            .toFixed()
        );

        await govPool.cancelVote(1, { from: SECOND });

        vote = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(1, SECOND, VoteType.PersonalVote))[1].toFixed(), "0");
      });

      it("should cancel treasury against if all conditions are met", async () => {
        await delegateTreasury(SECOND, wei("100"), [100, 101]);

        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(3, false, 0, [], { from: SECOND });

        let vote = await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(
          vote.totalRawVoted,
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );
        assert.equal(
          (await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[1].toFixed(),
          toBN(wei("100"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );

        await govPool.cancelVote(3, { from: SECOND });

        vote = await govPool.getUserVotes(3, SECOND, VoteType.TreasuryVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(3, SECOND, VoteType.TreasuryVote))[1].toFixed(), "0");
      });

      it("should vote cancel vote", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("100"), []);

        let vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);
        let coreVotes = await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote);

        assert.isTrue(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, wei("100"));
        assert.equal(coreVotes[0].toFixed(), wei("100"));
        assert.equal(coreVotes[1].toFixed(), "0");

        await truffleAssert.reverts(govPool.vote(1, false, wei("100"), []), "Gov: need cancel");

        await govPool.cancelVote(1);

        await govPool.vote(1, false, wei("200"), []);

        vote = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);
        coreVotes = await govPool.getTotalVotes(1, OWNER, VoteType.PersonalVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, wei("200"));
        assert.equal(coreVotes[0].toFixed(), "0");
        assert.equal(coreVotes[1].toFixed(), wei("200"));
      });

      it("should vote cancel vote after quorum reached", async () => {
        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        let core = (await govPool.getProposals(0, 1))[0].proposal.core;

        assert.equal(core.executeAfter, core.voteEnd);

        await govPool.cancelVote(1, { from: SECOND });

        core = (await govPool.getProposals(0, 1))[0].proposal.core;

        assert.equal(core.executeAfter, "0");

        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        core = (await govPool.getProposals(0, 1))[0].proposal.core;

        assert.equal(core.executeAfter, core.voteEnd);
      });

      it("should cancel properly if delegated voting is on", async () => {
        let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
        DEFAULT_SETTINGS.delegatedVotingAllowed = true;

        await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

        await nft.mint(SECOND, 100);
        await nft.mint(SECOND, 101);
        await nft.setApprovalForAll(userKeeper.address, true, { from: SECOND });

        await govPool.createProposal("example.com", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.deposit(0, [100, 101], { from: SECOND });

        await govPool.delegate(THIRD, wei("50000000000000000000"), [100], { from: SECOND });

        await govPool.vote(2, true, wei("100000000000000000000"), [100, 101], { from: SECOND });

        let vote = await govPool.getUserVotes(2, SECOND, VoteType.PersonalVote);

        assert.isTrue(vote.isVoteFor);
        assert.equal(
          vote.totalRawVoted,
          toBN(wei("100000000000000000000"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );
        assert.equal(
          (await govPool.getTotalVotes(2, SECOND, VoteType.PersonalVote))[0].toFixed(),
          toBN(wei("100000000000000000000"))
            .plus(toBN(wei("33000")).idiv(12).multipliedBy(2))
            .toFixed()
        );

        await govPool.cancelVote(2, { from: SECOND });

        vote = await govPool.getUserVotes(2, SECOND, VoteType.PersonalVote);

        assert.isFalse(vote.isVoteFor);
        assert.equal(vote.totalRawVoted, "0");
        assert.equal((await govPool.getTotalVotes(2, OWNER, VoteType.PersonalVote))[0].toFixed(), "0");
      });
    });

    describe("getProposalState()", () => {
      beforeEach(async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should return Undefined when proposal doesn't exist", async () => {
        assert.equal(await govPool.getProposalState(1), ProposalState.Undefined);
      });

      it("should return ExecutedFor state", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await executeProposal(
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]],
          true
        );

        assert.equal(await govPool.getProposalState(3), ProposalState.ExecutedFor);
      });

      it("should return ExecutedAgainst state", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await executeProposal(
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]],
          false
        );

        assert.equal(await govPool.getProposalState(3), ProposalState.ExecutedAgainst);
      });

      it("should return ExecutedFor state with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await executeValidatorProposal(
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]],
          true
        );

        assert.equal(await govPool.getProposalState(3), ProposalState.ExecutedFor);
      });

      it("should return ExecutedAgainst state with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await executeValidatorProposal(
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]],
          false
        );

        assert.equal(await govPool.getProposalState(3), ProposalState.ExecutedAgainst);
      });

      it("should return Voting state", async () => {
        await govPool.createProposal(
          "example.com",
          [[settings.address, 0, getBytesChangeExecutors([userKeeper.address], [4])]],
          []
        );

        assert.equal(await govPool.getProposalState(1), ProposalState.Voting);
      });

      it("should return Defeated state when quorum has not reached", async () => {
        await govPool.createProposal(
          "example.com",
          [[settings.address, 0, getBytesChangeExecutors([userKeeper.address], [4])]],
          []
        );

        await setTime((await getCurrentBlockTime()) + 1000000);

        assert.equal(await govPool.getProposalState(1), ProposalState.Defeated);
      });

      it("should return Defeated state when quorum has reached but vote result is against and no actions against", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal(
          "example.com",
          [[settings.address, 0, getBytesChangeExecutors([userKeeper.address], [4])]],
          []
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        assert.equal(await govPool.getProposalState(2), ProposalState.Defeated);
      });

      it("should return SucceededFor state when quorum has reached and vote result is for and without validators", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededFor);
      });

      it("should return SucceededAgainst state when quorum has reached and vote result is against and without validators", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededAgainst);
      });

      it("should return WaitingForVotingTransfer state when quorum has reached and votes for and with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        assert.notEqual((await validators.validatorsCount()).toFixed(), "0");
        assert.equal(await govPool.getProposalState(2), ProposalState.WaitingForVotingTransfer);
      });

      it("should return WaitingForVotingTransfer state when quorum has reached and votes against and with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        assert.notEqual((await validators.validatorsCount()).toFixed(), "0");
        assert.equal(await govPool.getProposalState(2), ProposalState.WaitingForVotingTransfer);
      });

      it("should return SucceededFor state when quorum has reached and votes for and with validators but there count is 0", async () => {
        await changeInternalSettings(true);

        await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);

        await validators.voteInternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await validators.executeInternalProposal(1);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal((await validators.validatorsCount()).toFixed(), "0");
        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededFor);
      });

      it("should return SucceededAgainst state when quorum has reached and votes for and with validators but there count is 0", async () => {
        await changeInternalSettings(true);

        await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);

        await validators.voteInternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await validators.executeInternalProposal(1);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal((await validators.validatorsCount()).toFixed(), "0");
        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededAgainst);
      });

      it("should return ValidatorVoting state when quorum has reached and votes for and with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        assert.equal(await govPool.getProposalState(2), ProposalState.ValidatorVoting);
      });

      it("should return ValidatorVoting state when quorum has reached and votes against and with validators", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        assert.equal(await govPool.getProposalState(2), ProposalState.ValidatorVoting);
      });

      it("should return Locked state when quorum has reached and votes for and without validators", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        assert.equal(await govPool.getProposalState(2), ProposalState.Locked);
      });

      it("should return Locked state when quorum has reached and votes for and with validators voted successful", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });

        assert.equal(await govPool.getProposalState(2), ProposalState.Locked);
      });

      it("should return SucceededFor state when quorum has reached and votes for and with validators voted successful", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededFor);
      });

      it("should return SucceededAgainst state when quorum has reached and votes for and with validators voted successful", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await govPool.getProposalState(2), ProposalState.SucceededAgainst);
      });

      it("should return Defeated state when quorum has reached and votes for and with validators voted against", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await validators.voteExternalProposal(2, wei("1000000000000"), false, { from: SECOND });

        assert.equal(await govPool.getProposalState(2), ProposalState.Defeated);
      });

      it("should return Defeated state when quorum has reached and votes against and with validators voted against", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await validators.voteExternalProposal(2, wei("1000000000000"), false, { from: SECOND });

        assert.equal(await govPool.getProposalState(2), ProposalState.Defeated);
      });

      it("should return Defeated state when quorum has reached and validators haven't voted", async () => {
        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);

        await setTime((await getCurrentBlockTime()) + 1000000);

        assert.equal(await govPool.getProposalState(2), ProposalState.Defeated);
      });
    });

    describe("moveProposalToValidators()", () => {
      beforeEach("setup", async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });

        await changeInternalSettings(true);

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );
      });

      it("should revert when try move without vote", async () => {
        await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
      });

      it("should move proposal to validators", async () => {
        await govPool.vote(2, false, wei("100000000000000000000"), [], { from: SECOND });

        const proposal = await getProposalByIndex(2);

        await govPool.moveProposalToValidators(2);

        const validatorProposal = await validators.getExternalProposal(2);

        assert.equal(await govPool.getProposalState(2), ProposalState.ValidatorVoting);
        assert.equal(proposal.core.executed, validatorProposal.core.executed);
        assert.equal(proposal.core.settings.quorumValidators, validatorProposal.core.quorum);
      });

      it("should revert when validators count is zero", async () => {
        await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);

        await validators.voteInternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        assert.equal((await govPool.getProposalState(2)).toFixed(), ProposalState.WaitingForVotingTransfer);

        await validators.executeInternalProposal(1);

        assert.equal((await validators.validatorsCount()).toFixed(), "0");
        assert.equal((await govPool.getProposalState(2)).toFixed(), ProposalState.SucceededFor);

        await truffleAssert.reverts(govPool.moveProposalToValidators(2), "Gov: can't be moved");
      });
    });

    describe("deposit, vote, withdraw", () => {
      it("should deposit, vote and withdraw tokens", async () => {
        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(SECOND, wei("1000"));
        await token.approve(userKeeper.address, wei("1000"), { from: SECOND });

        await depositAndVote(1, wei("1000"), [], wei("500"), [], SECOND);

        let withdrawable = await govPool.getWithdrawableAssets(SECOND);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("500"));
        assert.equal(withdrawable.nfts.length, "0");

        await govPool.vote(1, true, wei("1000"), [1, 2, 3, 4]);

        await setTime((await getCurrentBlockTime()) + 10000);

        withdrawable = await govPool.getWithdrawableAssets(SECOND);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("1000"));
        assert.equal(withdrawable.nfts.length, "0");

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), "0");

        await govPool.withdraw(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.withdraw(OWNER, 0, [1]);

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it("should deposit, vote, unlock", async () => {
        await govPool.deposit(wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, true, wei("1000"), [1, 2, 3, 4]);
        await govPool.vote(2, false, wei("510"), [1, 2]);

        let withdrawable = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");

        await govPool.unlock(OWNER);

        withdrawable = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");

        await setTime((await getCurrentBlockTime()) + 1000000);

        await govPool.unlock(OWNER);

        withdrawable = await govPool.getWithdrawableAssets(OWNER);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("1000"));
        assert.equal(withdrawable.nfts.length, 4);

        await govPool.withdraw(OWNER, wei("510"), [1]);

        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it("should not withdraw zero tokens", async () => {
        await truffleAssert.reverts(govPool.withdraw(OWNER, 0, []), "Gov: empty withdrawal");
      });

      it("should not delegate zero tokens", async () => {
        await truffleAssert.reverts(govPool.delegate(OWNER, 0, []), "Gov: empty delegation");
      });

      it("should not delegate if delegator's equal delegatee", async () => {
        await truffleAssert.reverts(govPool.delegate(OWNER, 1, []), "Gov: delegator's equal delegatee");
      });

      it("should not undelegate zero tokens", async () => {
        await truffleAssert.reverts(govPool.undelegate(OWNER, 0, []), "Gov: empty undelegation");
      });

      it("should not allow deposit-withdraw flashloan", async () => {
        await truffleAssert.reverts(
          govPool.multicall([getBytesGovDeposit(wei("1"), []), getBytesGovWithdraw(OWNER, wei("1"), [])]),
          "BlockGuard: locked"
        );
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
        executionDelay: 101,
        rewardsInfo: {
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        },
        executorDescription: "new_settings",
      };

      const NEW_INTERNAL_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 500,
        durationValidators: 60,
        quorum: PRECISION.times("1").toFixed(),
        quorumValidators: PRECISION.times("1").toFixed(),
        minVotesForVoting: wei("1"),
        minVotesForCreating: wei("1"),
        executionDelay: 0,
        rewardsInfo: {
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        },
        executorDescription: "new_internal_settings",
      };

      beforeEach(async () => {
        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), []);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should add new settings", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER)).tokens.toFixed(), "0");

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER)).tokens.toFixed(), 0);

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal((await govPool.getWithdrawableAssets(OWNER)).tokens.toFixed(), wei("1000"));

        await govPool.execute(1);

        assert.equal((await govPool.getWithdrawableAssets(OWNER)).tokens.toFixed(), wei("1000"));

        const addedSettings = await settings.settings(4);

        assert.isTrue(addedSettings.earlyCompletion);
        assert.isFalse(addedSettings.delegatedVotingAllowed);
        assert.equal(addedSettings.duration, 1);
        assert.equal(addedSettings.durationValidators, 1);
        assert.equal(addedSettings.quorum, 1);
        assert.equal(addedSettings.quorumValidators, 1);
        assert.equal(addedSettings.minVotesForVoting, 1);
        assert.equal(addedSettings.minVotesForCreating, 1);
        assert.equal(addedSettings.executionDelay, 101);

        assert.isTrue((await getProposalByIndex(1)).core.executed);
      });

      it("should not execute random proposals", async () => {
        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should change settings then full vote", async () => {
        const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });
        await govPool.moveProposalToValidators(1);

        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);

        await govPool.vote(2, true, wei("1000"), []);
        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await truffleAssert.reverts(govPool.moveProposalToValidators(2), "Gov: can't be moved");

        await govPool.execute(2);
      });

      it("should change validator balances through execution", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.execute(1);

        await truffleAssert.reverts(govPool.vote(1, true, wei("1000"), []), "Gov: vote unavailable");

        const validatorsToken = await ERC20Mock.at(await validators.govValidatorsToken());

        assert.equal((await validatorsToken.balanceOf(THIRD)).toFixed(), wei("10"));
      });

      it("should not execute defeated proposal", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);

        await setTime((await getCurrentBlockTime()) + 100000);

        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should not execute defeated because of against votes", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, false, wei("1000"), []);
        await govPool.vote(1, false, wei("100000000000000000000"), [], { from: SECOND });

        await truffleAssert.reverts(govPool.moveProposalToValidators(1), "Gov: can't be moved");
      });

      it("should add new settings, change executors and create default trusted proposal", async () => {
        const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);

        const addSettingsBytes = getBytesAddSettings([NEW_SETTINGS]);
        const changeExecutorBytes = getBytesChangeExecutors([executorTransfer.address], [4]);

        assert.equal(await govPool.getProposalState(1), ProposalState.Undefined);

        await govPool.createProposal(
          "example.com",
          [
            [settings.address, 0, addSettingsBytes],
            [settings.address, 0, changeExecutorBytes],
          ],
          []
        );

        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.execute(1);

        assert.equal(await govPool.getProposalState(1), ProposalState.ExecutedFor);
        assert.equal((await validators.getProposalState(1, false)).toFixed(), ValidatorsProposalState.Executed);
        assert.equal(toBN(await settings.executorToSettings(executorTransfer.address)).toFixed(), "4");

        const bytesExecute = getBytesExecute();
        const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

        await govPool.createProposal(
          "example.com",
          [
            [token.address, wei("1"), bytesApprove],
            [executorTransfer.address, wei("1"), bytesExecute],
          ],
          []
        );

        assert.equal(
          (await getProposalByIndex(2)).core.settings.executorDescription,
          POOL_PARAMETERS.settingsParams.proposalSettings[0].executorDescription
        );

        await govPool.createProposal(
          "example.com",
          [
            [token.address, "0", bytesApprove],
            [executorTransfer.address, wei("1"), bytesExecute],
          ],
          []
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
          [
            [token.address, "0", bytesApprove],
            [executorTransfer.address, wei("1"), bytesExecute],
          ],
          []
        );
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

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

        await govPool.createProposal("example.com", [[executorTransfer.address, 0, bytesExecute]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await truffleAssert.reverts(govPool.execute(1), "ERC20: insufficient allowance");
      });

      describe("self execution", () => {
        describe("changeVotePower()", () => {
          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.changeVotePower(SECOND), "Gov: not this contract");
          });

          it("should not change vote power if zero vote power contract", async () => {
            await truffleAssert.reverts(
              executeValidatorProposal([[govPool.address, 0, getBytesChangeVotePower(ZERO_ADDR)]]),
              "Gov: zero vote power contract"
            );
          });

          it("should change vote power if all conditions are met", async () => {
            assert.equal((await govPool.getHelperContracts()).votePower, votePower.address);

            await executeValidatorProposal([[govPool.address, 0, getBytesChangeVotePower(SECOND)]]);

            assert.equal((await govPool.getHelperContracts()).votePower, SECOND);
          });
        });

        describe("editDescriptionURL()", () => {
          it("should create proposal for editDescriptionURL", async () => {
            const newUrl = "new_url";

            await executeValidatorProposal([[govPool.address, 0, getBytesEditUrl(newUrl)]]);

            assert.equal(await govPool.descriptionURL(), newUrl);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.editDescriptionURL("new_url"), "Gov: not this contract");
          });
        });

        describe("setNftMultiplierAddress()", () => {
          it("should create proposal for setNftMultiplierAddress", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);
            assert.equal((await govPool.getNftContracts()).nftMultiplier, nftMultiplier.address);
          });

          it("should set zero address", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);

            await setNftMultiplierAddress(ZERO_ADDR);

            assert.equal((await govPool.getNftContracts()).nftMultiplier, ZERO_ADDR);
          });

          it("should change nftMultiplier to newer", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);

            const newNftMultiplier = await ERC721Multiplier.new();

            await setNftMultiplierAddress(newNftMultiplier.address);

            assert.equal((await govPool.getNftContracts()).nftMultiplier, newNftMultiplier.address);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(
              govPool.setNftMultiplierAddress(nftMultiplier.address),
              "Gov: not this contract"
            );
          });
        });

        describe("expert", () => {
          it("should be an expert if dexe nft is minted", async () => {
            assert.isFalse(await govPool.getExpertStatus(SECOND));

            await dexeExpertNft.mint(SECOND, "");

            assert.isTrue(await govPool.getExpertStatus(SECOND));
          });
        });

        describe("delegateTreasury() undelegateTreasury()", () => {
          it("should not delegate treasury if empty delegation", async () => {
            await truffleAssert.reverts(delegateTreasury(THIRD, "0", []), "Gov: empty delegation");
          });

          it("should create proposal for delegateTreasury and undelegateTreasury", async () => {
            assert.equal((await token.balanceOf(THIRD)).toFixed(), "0");
            assert.equal((await nft.balanceOf(THIRD)).toFixed(), "0");

            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).totalBalance.toFixed(), "0");
            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");

            assert.deepEqual((await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).nfts, []);
            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).ownedLength.toFixed(),
              "0"
            );

            await delegateTreasury(THIRD, wei("100"), ["11", "12"]);

            assert.equal((await token.balanceOf(THIRD)).toFixed(), "0");
            assert.equal((await nft.balanceOf(THIRD)).toFixed(), "0");

            assert.equal(
              (await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).totalBalance.toFixed(),
              wei("100")
            );
            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");

            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
              ["11", "12"]
            );
            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).ownedLength.toFixed(),
              "0"
            );

            const govPoolBalance = await token.balanceOf(govPool.address);
            await govPool.createProposal(
              "example.com",
              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, wei(50), ["11"])]],
              []
            );
            let proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, true, wei("1000"), []);
            await govPool.vote(proposalId, true, wei("100000000000000000000"), [], { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.voteExternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal((await token.balanceOf(govPool.address)).toFixed(), govPoolBalance.plus(wei("50")).toFixed());
            assert.equal(await nft.ownerOf("11"), govPool.address);
            assert.equal(await nft.ownerOf("12"), userKeeper.address);

            await govPool.createProposal(
              "example.com",
              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, wei(50), [])]],
              []
            );
            proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, true, wei("1000"), []);
            await govPool.vote(proposalId, true, wei("100000000000000000000"), [], { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.voteExternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal((await token.balanceOf(govPool.address)).toFixed(), govPoolBalance.plus(wei("100")).toFixed());
            await govPool.createProposal(
              "example.com",
              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, "0", ["12"])]],
              []
            );
            proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, true, wei("1000"), []);
            await govPool.vote(proposalId, true, wei("100000000000000000000"), [], { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.voteExternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal(await nft.ownerOf("12"), govPool.address);

            assert.equal((await token.balanceOf(THIRD)).toFixed(), "0");
            assert.equal((await nft.balanceOf(THIRD)).toFixed(), "0");

            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).totalBalance.toFixed(), "0");
            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");

            assert.deepEqual((await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).nfts, []);
            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).ownedLength.toFixed(),
              "0"
            );
          });

          it("should revert if call is not from expert", async () => {
            await token.mint(govPool.address, wei("1"));

            const bytesDelegateTreasury = getBytesDelegateTreasury(THIRD, wei("1"), []);

            await govPool.createProposal("example.com", [[govPool.address, 0, bytesDelegateTreasury]], []);

            const proposalId = await govPool.latestProposalId();

            await govPool.vote(proposalId, true, wei("1000"), []);
            await govPool.vote(proposalId, true, wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(proposalId);

            await validators.voteExternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });
            await truffleAssert.reverts(govPool.execute(proposalId), "Gov: delegatee is not an expert");
          });

          it("should not undelegate zero tokens", async () => {
            await truffleAssert.reverts(undelegateTreasury(THIRD, 0, []), "Gov: empty undelegation");
          });

          it("should revert if call is not from gov pool", async () => {
            await truffleAssert.reverts(govPool.delegateTreasury(SECOND, 0, []), "Gov: not this contract");

            await truffleAssert.reverts(govPool.undelegateTreasury(SECOND, 0, []), "Gov: not this contract");
          });
        });

        describe("changeVerifier", () => {
          it("should correctly set new verifier", async () => {
            const newAddress = SECOND;
            const bytesChangeVerifier = getBytesChangeVerifier(newAddress);

            await govPool.createProposal("example.com", [[govPool.address, 0, bytesChangeVerifier]], []);

            await govPool.vote(1, true, wei("1000"), []);
            await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.voteExternalProposal(1, wei("100"), true);
            await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

            await govPool.execute(1);

            assert.equal((await govPool.getOffchainInfo()).validator, newAddress);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.changeVerifier(SECOND), "Gov: not this contract");
          });
        });

        describe("changeBABTRestriction", () => {
          it("should change restriction", async () => {
            assert.isFalse(await govPool.onlyBABTHolders());

            const bytesChangeBABTRestriction = getBytesChangeBABTRestriction(true);

            await govPool.createProposal("example.com", [[govPool.address, 0, bytesChangeBABTRestriction]], []);

            await govPool.vote(1, true, wei("1000"), []);
            await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.voteExternalProposal(1, wei("100"), true);
            await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

            await govPool.execute(1);

            assert.isTrue(await govPool.onlyBABTHolders());
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.changeBABTRestriction(true), "Gov: not this contract");
          });
        });

        describe("vote and execute in one block", () => {
          describe("vote-execute flashloan protection", () => {
            const USER_KEERER_SETTINGS = {
              earlyCompletion: true,
              delegatedVotingAllowed: false,
              validatorsVote: false,
              duration: 500,
              durationValidators: 500,
              quorum: PRECISION.times("1").toFixed(),
              quorumValidators: 0,
              minVotesForVoting: 0,
              minVotesForCreating: 0,
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteRewardsCoefficient: 0,
              },
              executorDescription: "new_internal_settings",
            };

            let VICTIM;
            let DELEGATOR;

            beforeEach(async () => {
              const addSettingsBytes = getBytesAddSettings([USER_KEERER_SETTINGS]);

              await govPool.createProposal("example.com", [[settings.address, 0, addSettingsBytes]], []);
              await govPool.vote(1, true, wei("1000"), []);
              await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

              await govPool.moveProposalToValidators(1);

              await validators.voteExternalProposal(1, wei("100"), true);
              await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

              await govPool.execute(1);

              const changeExecutorBytes = getBytesChangeExecutors([userKeeper.address], [4]);

              await govPool.createProposal("example.com", [[settings.address, 0, changeExecutorBytes]], []);
              await govPool.vote(2, true, wei("1000"), []);
              await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

              await govPool.moveProposalToValidators(2);

              await validators.voteExternalProposal(2, wei("100"), true);
              await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });

              await govPool.execute(2);

              VICTIM = THIRD;
              DELEGATOR = FOURTH;

              await token.mint(VICTIM, wei("111222"));
              await token.approve(userKeeper.address, wei("111222"), { from: VICTIM });
              await govPool.deposit(wei("111222"), [], { from: VICTIM });

              await token.mint(DELEGATOR, wei("100000000000000000000"));
              await token.approve(userKeeper.address, wei("100000000000000000000"), { from: DELEGATOR });

              await govPool.deposit(wei("100000000000000000000"), [], { from: DELEGATOR });
              await govPool.delegate(SECOND, wei("100000000000000000000"), [], { from: DELEGATOR });
            });

            it("should not withdraw victim's tokens in the same block if vote", async () => {
              const bytes = getBytesKeeperWithdrawTokens(VICTIM, SECOND, wei("111222"));

              await govPool.createProposal("example.com", [[userKeeper.address, 0, bytes]], [], {
                from: SECOND,
              });

              await truffleAssert.reverts(
                govPool.multicall([getBytesGovVote(3, wei("100000000000000000000"), []), getBytesGovExecute(3)], {
                  from: SECOND,
                }),
                "Gov: invalid status"
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
            actionsOnFor: proposalView.proposal[2],
            actionsOnAgainst: proposalView.proposal[3],
          },
          validatorProposal: {
            core: {
              voteEnd: proposalView.validatorProposal.core.voteEnd,
              executeAfter: proposalView.validatorProposal.core.executeAfter,
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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
          },
          executorDescription: "new_settings",
        };

        let proposalViews;

        beforeEach("setup", async () => {
          const { durationValidators, quorumValidators } = POOL_PARAMETERS.settingsParams.proposalSettings[2];
          const startTime = await getCurrentBlockTime();

          proposalViews = [
            {
              proposal: {
                descriptionURL: "example.com",
                actionsOnFor: [[SECOND, "0", getBytesApprove(SECOND, 1)]],
                actionsOnAgainst: [],
              },
              validatorProposal: {
                core: {
                  voteEnd: "0",
                  executeAfter: "0",
                  quorum: "0",
                },
              },
            },
            {
              proposal: {
                descriptionURL: "example2.com",
                actionsOnFor: [[THIRD, "0", getBytesApprove(SECOND, 1)]],
                actionsOnAgainst: [],
              },
              validatorProposal: {
                core: {
                  voteEnd: "0",
                  executeAfter: "0",
                  quorum: "0",
                },
              },
            },
            {
              proposal: {
                descriptionURL: "example3.com",
                actionsOnFor: [[settings.address, "0", getBytesEditSettings([3], [NEW_SETTINGS])]],
                actionsOnAgainst: [],
              },
              validatorProposal: {
                core: {
                  voteEnd: (durationValidators + startTime + 1000000 + 1).toString(),
                  executeAfter: "0",
                  quorum: quorumValidators,
                },
              },
            },
          ];

          await govPool.deposit(wei("1000"), []);

          for (const proposalView of proposalViews) {
            const { descriptionURL, actionsOnFor, actionsOnAgainst } = proposalView.proposal;
            await govPool.createProposal(descriptionURL, actionsOnFor, actionsOnAgainst);
          }

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.vote(3, true, wei("1000"), []);
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

    describe("getUserActiveProposalsCount()", () => {
      it("should return zero if no proposals", async () => {
        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 0);
      });

      it("should correctly return count of active proposals", async () => {
        await govPool.deposit(wei("1000"), []);

        await govPool.createProposal("example.com", [[SECOND, "0", getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal(
          "example.com",
          [[dp.address, 0, getBytesDistributionProposal(2, token.address, wei("100"))]],
          []
        );

        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 0);

        await govPool.vote(1, true, wei("500"), []);

        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 1);

        await govPool.vote(2, true, wei("500"), []);

        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 2);

        await setTime((await getCurrentBlockTime()) + 1000000);

        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 2);

        await govPool.unlock(OWNER);

        assert.equal(await govPool.getUserActiveProposalsCount(OWNER), 0);
      });
    });

    describe("rewards", () => {
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
        executionDelay: 0,
        rewardsInfo: {
          rewardToken: ETHER_ADDR,
          creationReward: wei("10"),
          executionReward: wei("5"),
          voteRewardsCoefficient: PRECISION.toFixed(),
        },
        executorDescription: "new_settings",
      };

      let treasury;

      beforeEach(async () => {
        treasury = await contractsRegistry.getTreasuryContract();

        await token.mint(SECOND, wei("100000000000000000000"));

        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), []);
        await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });
      });

      it("should claim reward on For", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        let rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainTokens, [ZERO_ADDR]);
        assert.deepEqual(rewards.staticRewards, ["0"]);
        assert.deepEqual(rewards.votingRewards[0].personal, "0");
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        await govPool.execute(1);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          toBN(wei("100000000000000000000")).plus(wei(1000)).plus(wei(20)).idiv(5).toFixed()
        );

        rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainTokens, [rewardToken.address]);
        assert.deepEqual(rewards.staticRewards, [wei(20)]);
        assert.deepEqual(rewards.votingRewards[0].personal, wei(1000));

        await govPool.claimRewards([1], OWNER);

        const ownerReward = toBN(wei(1000)).plus(wei(20));
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), ownerReward.toFixed());
      });

      it("should claim reward on Against", async () => {
        await changeInternalSettings(true);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          toBN(wei("100000000000000000000")).plus(wei(20)).idiv(5).toFixed()
        );

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await govPool.createProposal(
          "example.com",
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(2, wei("100"), [], false)]]
        );

        await govPool.vote(3, false, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(3);

        await validators.voteExternalProposal(3, wei("1000000000000"), true, { from: SECOND });

        let rewards = await govPool.getPendingRewards(OWNER, [3]);

        assert.deepEqual(rewards.onchainTokens, [ZERO_ADDR]);
        assert.deepEqual(rewards.staticRewards, ["0"]);
        assert.deepEqual(rewards.votingRewards[0].personal, "0");
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        await govPool.execute(3);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          toBN(wei("100000000000000000000")).plus(wei(20)).idiv(5).multipliedBy(2).toFixed()
        );

        rewards = await govPool.getPendingRewards(OWNER, [3]);

        assert.deepEqual(rewards.onchainTokens, [rewardToken.address]);
        assert.deepEqual(rewards.staticRewards, [wei(20)]);
        assert.deepEqual(rewards.votingRewards[0].personal, "0");

        await govPool.claimRewards([3], OWNER);

        const ownerReward = toBN(wei(20));
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), ownerReward.toFixed());
      });

      it("should claim reward properly if nft multiplier has been set", async () => {
        await setNftMultiplierAddress(nftMultiplier.address);

        await nftMultiplier.mint(OWNER, PRECISION.times("2.5"), 1000, "");
        await nftMultiplier.transferOwnership(govPool.address);
        await nftMultiplier.lock(1);

        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(2, true, wei("1000"), []);
        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(2);
        await validators.voteExternalProposal(2, wei("100"), true);
        await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });
        await govPool.execute(2);
        await govPool.claimRewards([2], OWNER);

        assert.equal(
          (await rewardToken.balanceOf(OWNER)).toFixed(),
          toBN(wei(1000)).plus(wei(20)).times(3.5).toFixed()
        );
      });

      it("should execute and claim", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        await executeAndClaim(1, OWNER);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          toBN(wei("100000000000000000000")).plus(wei(1000)).plus(wei(20)).idiv(5).toFixed()
        );
        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), toBN(wei(1000)).plus(wei(20)).toFixed());
      });

      it("should claim reward in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await network.provider.send("hardhat_setBalance", [govPool.address, "0x" + wei("100")]);

        await govPool.execute(1);

        await govPool.createProposal("example.com", [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]], []);
        await govPool.vote(2, true, wei("1"), []);

        assert.equal(await web3.eth.getBalance(treasury), "0");

        await govPool.execute(2);

        assert.equal(await web3.eth.getBalance(treasury), wei("3.2"));

        let balance = toBN(await web3.eth.getBalance(OWNER));

        let rewards = await govPool.getPendingRewards(OWNER, [1, 2]);

        assert.deepEqual(rewards.onchainTokens, [rewardToken.address, ETHER_ADDR]);
        assert.deepEqual(rewards.staticRewards, [wei("20"), wei("15")]);
        assert.deepEqual(rewards.votingRewards[0].personal, "0");
        assert.deepEqual(rewards.votingRewards[1].personal, wei("1"));
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        let tx = await govPool.claimRewards([2], OWNER);

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

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));

        await govPool.execute(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));
      });

      it("should not claim rewards in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("1000"), []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("100"), true);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await executeAndClaim(1, OWNER);

        await impersonate(coreProperties.address);

        await token.mint(coreProperties.address, wei("100000000000000000000"));
        await token.approve(userKeeper.address, wei("100000000000000000000"), { from: coreProperties.address });

        await govPool.deposit(wei("100000000000000000000"), [], {
          from: coreProperties.address,
        });

        await network.provider.send("hardhat_setBalance", [
          govPool.address, // address
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", // balance
        ]);

        await govPool.createProposal("example.com", [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]], [], {
          from: coreProperties.address,
        });

        await govPool.vote(2, true, wei("100000000000000000000"), [], { from: coreProperties.address });

        await govPool.execute(2);

        await truffleAssert.reverts(
          govPool.claimRewards([2], coreProperties.address, { from: coreProperties.address }),
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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: wei("10"),
            executionReward: wei("5"),
            voteRewardsCoefficient: PRECISION.toFixed(),
          },
          executorDescription: "new_settings",
        };

        const bytes = getBytesEditSettings([1], [NO_REWARDS_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, true, wei("1"), []);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2], OWNER), "Gov: rewards are off");
      });

      it("should revert when try claim reward before execute", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await truffleAssert.reverts(govPool.claimRewards([1], OWNER), "Gov: proposal is not executed");
      });

      it("should mint when balance < rewards", async () => {
        let newToken = await ERC20Mock.new("NT", "NT", 18);

        NEW_SETTINGS.rewardsInfo.rewardToken = newToken.address;

        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, true, wei("1"), []);

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), "0");
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("0"));

        await executeAndClaim(2, OWNER);

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), wei("3.2"));
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("16"));
      });
    });

    describe("powered rewards & micropool & treasury", () => {
      let powerPerNft;

      let delegator1;
      let delegator2;
      let delegator3;

      async function getVotingRewards(
        rawCoreVotes,
        userVotes,
        coreVotes,
        personalRawVote,
        micropoolRawVote,
        treasuryRawVote
      ) {
        const userRewards = toBN(rawCoreVotes).multipliedBy(userVotes).idiv(coreVotes);

        const totalRawVote = toBN(personalRawVote).plus(micropoolRawVote).plus(treasuryRawVote);

        const percentages = await coreProperties.getVoteRewardsPercentages();

        const personalShare = userRewards.multipliedBy(personalRawVote).idiv(totalRawVote);
        let micropoolShare = userRewards.multipliedBy(micropoolRawVote).idiv(totalRawVote);
        const treasuryShare = userRewards
          .multipliedBy(treasuryRawVote)
          .idiv(totalRawVote)
          .multipliedBy(percentages[1])
          .idiv(PERCENTAGE_100);

        const delegatorsRewards = micropoolShare.minus(
          micropoolShare.multipliedBy(percentages[0]).idiv(PERCENTAGE_100)
        );

        micropoolShare = micropoolShare.minus(delegatorsRewards);

        const votingRewards = personalShare.plus(micropoolShare).plus(treasuryShare);

        return {
          voting: votingRewards,
          personal: personalShare,
          micropool: micropoolShare,
          treasury: treasuryShare,
          delegators: delegatorsRewards,
        };
      }

      beforeEach(async () => {
        await token.burn(OWNER, wei("99999990000"));
        await token.mint(SECOND, wei("1000000"));

        await token.approve(userKeeper.address, wei("1000000"), { from: SECOND });

        await govPool.deposit(wei("1000"), []);
        await govPool.deposit(wei("1000000"), [], { from: SECOND });

        const squareVotePower = await VotePowerMock.new();
        await executeValidatorProposal([[govPool.address, 0, getBytesChangeVotePower(squareVotePower.address)]]);

        delegator1 = FOURTH;
        delegator2 = FIFTH;
        delegator3 = SIXTH;

        await token.mint(delegator1, wei("200000"));
        await token.mint(delegator2, wei("400000"));
        await token.mint(delegator3, wei("200000"));

        for (let i = 100; i < 102; i++) {
          await nft.mint(delegator1, i);
          await nft.approve(userKeeper.address, i, { from: delegator1 });
        }

        for (let i = 200; i < 204; i++) {
          await nft.mint(delegator2, i);
          await nft.approve(userKeeper.address, i, { from: delegator2 });
        }

        powerPerNft = toBN(wei("33000")).idiv(16);

        await token.approve(userKeeper.address, wei("200000"), { from: delegator1 });
        await token.approve(userKeeper.address, wei("400000"), { from: delegator2 });
        await token.approve(userKeeper.address, wei("200000"), { from: delegator3 });

        await govPool.deposit(wei("200000"), [100, 101], { from: delegator1 });
        await govPool.deposit(wei("400000"), [200, 201, 202, 203], { from: delegator2 });
        await govPool.deposit(wei("200000"), [], { from: delegator3 });
      });

      it("should claim rewards properly if all conditions are met", async () => {
        await executeValidatorProposal([[expertNft.address, 0, getBytesMintExpertNft(SECOND, "URI")]]);

        await delegateTreasury(SECOND, wei("100000"), []);

        await govPool.delegate(SECOND, wei("100000"), [100], { from: delegator1 });
        await govPool.delegate(SECOND, wei("50000"), [200], { from: delegator2 });

        await govPool.delegate(SECOND, wei("250000"), [201, 202], { from: delegator2 });

        await executeValidatorProposal([[token.address, 0, getBytesApprove(SECOND, 1)]]);

        await govPool.delegate(SECOND, wei("100000"), [203], { from: delegator2 });
        await govPool.delegate(SECOND, wei("200000"), [], { from: delegator3 });

        let core = (await govPool.getProposals(3, 1))[0].proposal.core;

        assert.equal(core.votesFor, toBN(wei("1500000")).plus(powerPerNft.multipliedBy(4)).pow(2).toFixed());

        const expectedRewards = await getVotingRewards(
          toBN(wei("1500000")).plus(powerPerNft.multipliedBy(4)),
          toBN(wei("1500000")).plus(powerPerNft.multipliedBy(4)).pow(2),
          toBN(wei("1500000")).plus(powerPerNft.multipliedBy(4)).pow(2),
          wei("1000000"),
          toBN(wei("400000")).plus(powerPerNft.multipliedBy(4)),
          wei("100000")
        );

        let actualRewards = await govPool.getPendingRewards(SECOND, [4]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, expectedRewards.personal.toFixed());
        assert.equal(actualRewards.votingRewards[0].micropool, expectedRewards.micropool.toFixed());
        assert.equal(actualRewards.votingRewards[0].treasury, expectedRewards.treasury.toFixed());

        await govPool.claimRewards([4], SECOND, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(SECOND)).toFixed(), expectedRewards.voting.toFixed());

        actualRewards = await govPool.getPendingRewards(SECOND, [4]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, "0");
        assert.equal(actualRewards.votingRewards[0].micropool, "0");
        assert.equal(actualRewards.votingRewards[0].treasury, "0");

        let delegatorRewardsView = await govPool.getDelegatorRewards([4], delegator1, SECOND);

        const delegator1Rewards = expectedRewards.delegators
          .multipliedBy(toBN(wei("100000")).plus(powerPerNft))
          .idiv(toBN(wei("400000")).plus(powerPerNft.multipliedBy(4)));
        const delegator2Rewards = expectedRewards.delegators
          .multipliedBy(toBN(wei("300000")).plus(powerPerNft.multipliedBy(3)))
          .idiv(toBN(wei("400000")).plus(powerPerNft.multipliedBy(4)));

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [true]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, [delegator1Rewards.toFixed()]);

        delegatorRewardsView = await govPool.getDelegatorRewards([4], delegator2, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [true]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, [delegator2Rewards.toFixed()]);

        delegatorRewardsView = await govPool.getDelegatorRewards([4], delegator3, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [true]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, ["0"]);

        delegatorRewardsView = await govPool.getDelegatorRewards([4], delegator1, delegator2);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [false]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, ["0"]);

        await govPool.claimMicropoolRewards([4], delegator1, SECOND, { from: delegator1 });
        await govPool.claimMicropoolRewards([4], delegator2, SECOND, { from: delegator2 });

        assert.equal((await rewardToken.balanceOf(delegator1)).toFixed(), delegator1Rewards.toFixed());
        assert.equal((await rewardToken.balanceOf(delegator2)).toFixed(), delegator2Rewards.toFixed());

        assert.equal((await govPool.getPendingRewards(SECOND, [4])).votingRewards[0].personal, "0");

        assert.isTrue((await govPool.getDelegatorRewards([4], delegator1, SECOND)).isClaimed[0]);

        await truffleAssert.reverts(
          govPool.claimMicropoolRewards([4], delegator1, SECOND, { from: delegator1 }),
          "Gov: no micropool rewards"
        );
      });

      it("should claim latest rewards", async () => {
        await changeInternalSettings(false, 1);

        await govPool.createProposal("example.com", [[govPool.address, 0, getBytesEditUrl("NEW_URL")]], []);
        await govPool.vote(3, true, 1, [], { from: SECOND });

        assert.equal((await govPool.getProposalState(3)).toNumber(), ProposalState.Voting);

        await govPool.delegate(SECOND, 1, [], { from: delegator2 });

        assert.equal((await govPool.getProposalState(3)).toNumber(), ProposalState.Voting);

        await govPool.delegate(SECOND, wei("300000"), [], { from: delegator2 });

        assert.equal((await govPool.getProposalState(3)).toNumber(), ProposalState.Locked);

        await govPool.execute(3);

        let delegatorRewardsView = await govPool.getDelegatorRewards([3], delegator2, SECOND);

        assert.equal(delegatorRewardsView.expectedRewards, wei("240000"));
      });

      it("should claim rewards properly if multicall delegation and delegator claim first", async () => {
        let DEFAULT_SETTINGS = POOL_PARAMETERS.settingsParams.proposalSettings[0];
        DEFAULT_SETTINGS.validatorsVote = false;
        DEFAULT_SETTINGS.duration = 10000;

        await executeValidatorProposal([[settings.address, 0, getBytesEditSettings([0], [DEFAULT_SETTINGS])]]);

        await govPool.delegate(SECOND, wei("100000"), [100, 101], { from: delegator1 });
        await govPool.multicall(
          [getBytesGovDelegate(SECOND, wei("50000"), [200]), getBytesGovDelegate(SECOND, wei("50000"), [])],
          { from: delegator2 }
        );

        await succeedProposal([[token.address, 0, getBytesApprove(SECOND, 1)]]);

        assert.equal(await govPool.getProposalState(3), ProposalState.Voting);

        await govPool.multicall(
          [getBytesGovDelegate(SECOND, wei("50000"), [202]), getBytesGovDelegate(SECOND, wei("50000"), [201])],
          { from: delegator2 }
        );

        await setTime((await getCurrentBlockTime()) + 10000);

        assert.equal(await govPool.getProposalState(3), ProposalState.SucceededFor);

        await govPool.multicall(
          [getBytesGovDelegate(SECOND, wei("50000"), [203]), getBytesGovDelegate(SECOND, wei("50000"), [])],
          { from: delegator2 }
        );

        let delegatorRewardsView = await govPool.getDelegatorRewards([3], delegator2, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [ZERO_ADDR]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [false]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, ["0"]);

        await truffleAssert.reverts(
          govPool.claimMicropoolRewards([3], delegator2, SECOND, { from: delegator2 }),
          "Gov: no micropool rewards"
        );

        await govPool.execute(3);

        assert.equal(await govPool.getProposalState(3), ProposalState.ExecutedFor);

        const expectedRewards = await getVotingRewards(
          toBN(wei("1300000")).plus(powerPerNft.multipliedBy(5)),
          toBN(wei("1300000")).plus(powerPerNft.multipliedBy(5)).pow(2),
          toBN(wei("1300000")).plus(powerPerNft.multipliedBy(5)).pow(2),
          wei("1000000"),
          toBN(wei("300000")).plus(powerPerNft.multipliedBy(5)),
          "0"
        );

        const delegator1Rewards = expectedRewards.delegators
          .multipliedBy(toBN(wei("100000")).plus(powerPerNft.multipliedBy(2)))
          .idiv(toBN(wei("300000")).plus(powerPerNft.multipliedBy(5)));
        const delegator2Rewards = expectedRewards.delegators
          .multipliedBy(toBN(wei("200000")).plus(powerPerNft.multipliedBy(3)))
          .idiv(toBN(wei("300000")).plus(powerPerNft.multipliedBy(5)));

        delegatorRewardsView = await govPool.getDelegatorRewards([3], delegator2, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [true]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, [delegator2Rewards.toFixed()]);

        let actualRewards = await govPool.getPendingRewards(SECOND, [3]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, expectedRewards.personal.toFixed());
        assert.equal(actualRewards.votingRewards[0].micropool, expectedRewards.micropool.toFixed());
        assert.equal(actualRewards.votingRewards[0].treasury, expectedRewards.treasury.toFixed());

        await govPool.claimMicropoolRewards([3], delegator2, SECOND, { from: SECOND });

        actualRewards = await govPool.getPendingRewards(SECOND, [3]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, expectedRewards.personal.toFixed());
        assert.equal(actualRewards.votingRewards[0].micropool, expectedRewards.micropool.toFixed());
        assert.equal(actualRewards.votingRewards[0].treasury, expectedRewards.treasury.toFixed());

        await govPool.claimRewards([3], SECOND, { from: THIRD });

        actualRewards = await govPool.getPendingRewards(SECOND, [3]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, "0");
        assert.equal(actualRewards.votingRewards[0].micropool, "0");
        assert.equal(actualRewards.votingRewards[0].treasury, "0");

        delegatorRewardsView = await govPool.getDelegatorRewards([3], delegator1, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [true]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, [delegator1Rewards.toFixed()]);

        await truffleAssert.reverts(
          govPool.claimMicropoolRewards([3], delegator2, SECOND, { from: delegator2 }),
          "Gov: no micropool rewards"
        );
        await govPool.claimMicropoolRewards([3], delegator1, SECOND, { from: THIRD });

        actualRewards = await govPool.getPendingRewards(SECOND, [3]);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, "0");
        assert.equal(actualRewards.votingRewards[0].micropool, "0");
        assert.equal(actualRewards.votingRewards[0].treasury, "0");
        assert.equal((await rewardToken.balanceOf(SECOND)).toFixed(), expectedRewards.voting.toFixed());
        assert.equal((await rewardToken.balanceOf(delegator1)).toFixed(), delegator1Rewards.toFixed());
        assert.equal((await rewardToken.balanceOf(delegator2)).toFixed(), delegator2Rewards.toFixed());
      });

      it("should claim rewards properly if vote against and nft multiplier is zero", async () => {
        await setNftMultiplierAddress(ZERO_ADDR);
        await changeInternalSettings(false);

        await govPool.createProposal("", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await govPool.delegate(SECOND, wei("200000"), [], { from: delegator1 });
        await govPool.delegate(SECOND, wei("400000"), [], { from: delegator2 });

        await executeProposal(
          [[govPool.address, 0, getBytesGovVote(4, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(4, wei("100"), [], false)]],
          false
        );

        const expectedRewards = await getVotingRewards(
          wei("1600000"),
          toBN(wei("1600000")).pow(2),
          toBN(wei("1600000")).pow(2),
          wei("1000000"),
          wei("600000"),
          "0"
        );

        const delegator1Rewards = expectedRewards.delegators.multipliedBy(wei("200000")).idiv(wei("600000"));

        let delegatorRewardsView = await govPool.getDelegatorRewards([5], delegator1, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [rewardToken.address]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [false]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, [delegator1Rewards.toFixed()]);

        let actualRewards = await govPool.getPendingRewards(SECOND, [5]);

        assert.deepEqual(actualRewards.onchainTokens, [rewardToken.address]);
        assert.equal(actualRewards.votingRewards[0].personal, expectedRewards.personal.toFixed());
        assert.equal(actualRewards.votingRewards[0].micropool, expectedRewards.micropool.toFixed());
        assert.equal(actualRewards.votingRewards[0].treasury, expectedRewards.treasury.toFixed());

        await govPool.claimMicropoolRewards([5], delegator1, SECOND, { from: delegator1 });
        await govPool.claimRewards([5], SECOND, { from: SECOND });

        await truffleAssert.reverts(govPool.claimRewards([5], SECOND, { from: SECOND }), "Gov: zero rewards");

        assert.equal((await rewardToken.balanceOf(SECOND)).toFixed(), expectedRewards.voting.toFixed());
        assert.equal((await rewardToken.balanceOf(delegator1)).toFixed(), delegator1Rewards.toFixed());
      });

      it("should claim rewards properly if try mint", async () => {
        await setNftMultiplierAddress(ZERO_ADDR);
        await changeInternalSettings(false);

        await govPool.createProposal("", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await govPool.delegate(SECOND, wei("200000"), [], { from: delegator1 });
        await govPool.delegate(SECOND, wei("400000"), [], { from: delegator2 });

        await executeProposal(
          [[govPool.address, 0, getBytesGovVote(4, wei("100"), [], true)]],
          [[govPool.address, 0, getBytesGovVote(4, wei("100"), [], false)]],
          false
        );

        await rewardToken.burn(govPool.address, await rewardToken.balanceOf(govPool.address));
        await rewardToken.mint(govPool.address, wei(1));

        await rewardToken.toggleMint();

        await govPool.claimMicropoolRewards([5], delegator1, SECOND, { from: delegator1 });

        assert.equal((await rewardToken.balanceOf(delegator1)).toFixed(), wei(1));
      });

      it("should have zero rewards if vote against and empty data against", async () => {
        await changeInternalSettings(false);

        await govPool.createProposal("", [[token.address, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(govPool.address, wei("100"));

        await impersonate(govPool.address);

        await token.approve(userKeeper.address, wei("100"), { from: govPool.address });
        await govPool.deposit(wei("100"), [], { from: govPool.address });

        await govPool.delegate(SECOND, wei("200000"), [], { from: delegator1 });
        await govPool.delegate(SECOND, wei("400000"), [], { from: delegator2 });

        await succeedProposal([[govPool.address, 0, getBytesGovVote(3, wei("100"), [], true)]], [], false);

        assert.equal(await govPool.getProposalState(4), ProposalState.Defeated);

        let delegatorRewardsView = await govPool.getDelegatorRewards([4], delegator1, SECOND);

        assert.deepEqual(delegatorRewardsView.rewardTokens, [ZERO_ADDR]);
        assert.deepEqual(delegatorRewardsView.isVoteFor, [false]);
        assert.deepEqual(delegatorRewardsView.isClaimed, [false]);
        assert.deepEqual(delegatorRewardsView.expectedRewards, ["0"]);

        const actualRewards = await govPool.getPendingRewards(SECOND, [4]);

        assert.deepEqual(actualRewards.onchainTokens, [ZERO_ADDR]);
        assert.equal(actualRewards.votingRewards[0].personal, "0");
        assert.equal(actualRewards.votingRewards[0].micropool, "0");
        assert.equal(actualRewards.votingRewards[0].treasury, "0");
      });
    });

    describe("credit", () => {
      beforeEach(async () => {
        await setTime(10000000);
      });

      describe("setCreditInfo()", () => {
        let GOVPOOL;

        beforeEach(() => {
          GOVPOOL = govPool.address;
          impersonate(govPool.address);
        });

        it("empty credit after deploy", async () => {
          assert.deepEqual(await govPool.getCreditInfo(), []);
        });

        it("reverts if sender not a govpool", async () => {
          await truffleAssert.reverts(govPool.setCreditInfo([SECOND], ["50000"]), "Gov: not this contract");
        });

        it("reverts with different lenth of arrays", async () => {
          await truffleAssert.reverts(
            govPool.setCreditInfo([SECOND, THIRD], ["50000"], { from: GOVPOOL }),
            "GPC: Number of tokens and amounts are not equal"
          );
        });

        it("reverts with zero address", async () => {
          await truffleAssert.reverts(
            govPool.setCreditInfo([ZERO_ADDR], ["50000"], { from: GOVPOOL }),
            "GPC: Token address could not be zero"
          );
        });

        it("sets new token correct", async () => {
          await govPool.setCreditInfo([SECOND], ["50000"], { from: GOVPOOL });
          assert.deepEqual(await govPool.getCreditInfo(), [[SECOND, "50000", "50000"]]);
        });

        it("batch set", async () => {
          const TOKENS = [
            [SECOND, "2000", "2000"],
            [THIRD, "3000", "3000"],
            [FOURTH, "4000", "4000"],
            [FIFTH, "5000", "5000"],
            [SIXTH, "6000", "6000"],
          ];

          for (let i = 0; i < 2; i++) {
            let tokensArray = [];
            let amountArray = [];

            for (let j = 1; j <= 4; j++) {
              tokensArray.push(TOKENS[i + j - 1][0]);
              amountArray.push(TOKENS[i + j - 1][1]);

              await govPool.setCreditInfo(tokensArray, amountArray, { from: GOVPOOL });

              assert.deepEqual(await govPool.getCreditInfo(), TOKENS.slice(i, i + j));

              await govPool.setCreditInfo([], [], { from: GOVPOOL });
              assert.deepEqual(await govPool.getCreditInfo(), []);
            }
          }
        });
      });

      describe("transferCreditAmount()", () => {
        let GOVPOOL;
        let VALIDATORS;
        let CREDIT_TOKEN_1;
        let CREDIT_TOKEN_2;
        let startTime;

        beforeEach(async () => {
          GOVPOOL = govPool.address;
          VALIDATORS = validators.address;

          impersonate(govPool.address);
          impersonate(validators.address);

          CREDIT_TOKEN_1 = await ERC20Mock.new("Mock", "Mock", 18);
          await CREDIT_TOKEN_1.mint(govPool.address, wei("10000"));

          CREDIT_TOKEN_2 = await ERC20Mock.new("Mock", "Mock", 18);
          await CREDIT_TOKEN_2.mint(govPool.address, wei("100000"));
        });

        it("cant call if not validator contract", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND),
            "Gov: not the validators contract"
          );
          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: GOVPOOL }),
            "Gov: not the validators contract"
          );
        });

        it("reverts if number of tokens different from amounts number ", async () => {
          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000", "2000"], SECOND, { from: VALIDATORS }),
            "GPC: Number of tokens and amounts are not equal"
          );
        });

        it("could transfer", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });

          assert.equal((await CREDIT_TOKEN_1.balanceOf(SECOND)).toFixed(), "0");

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });

          assert.equal((await CREDIT_TOKEN_1.balanceOf(SECOND)).toFixed(), "1000");
        });

        it("cant get more than month limit", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1001"], SECOND, { from: VALIDATORS }),
            "GPC: Current credit permission < amount to withdraw"
          );
        });

        it("shows correct limit after transfer", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["300"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "700"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["700"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "0"]]);
        });

        it("cant transfer on second withdraw more than reminder", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["300"], SECOND, { from: VALIDATORS });
          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["701"], SECOND, { from: VALIDATORS }),
            "GPC: Current credit permission < amount to withdraw"
          );
        });

        it("can wait for 1 month and withdraw again", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });

          assert.equal((await CREDIT_TOKEN_1.balanceOf(SECOND)).toFixed(), "0");

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });

          startTime = await getCurrentBlockTime();

          await setTime(startTime + 30 * 24 * 60 * 60);

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "1000"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });

          assert.equal((await CREDIT_TOKEN_1.balanceOf(SECOND)).toFixed(), "2000");
        });

        it("can withdraw once more before 1 month", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });

          startTime = await getCurrentBlockTime();
          await setTime(startTime + 30 * 24 * 60 * 60 - 100);

          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS }),
            "GPC: Current credit permission < amount to withdraw"
          );
        });

        it("correctly shows limit after great amount of time", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "1000"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "0"]]);

          startTime = await getCurrentBlockTime();
          await setTime(startTime + 200 * 24 * 60 * 60);

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "1000"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1000"], SECOND, { from: VALIDATORS });
        });

        it("correctly counts amount to withdraw according to time", async () => {
          const WEEK = (30 * 24 * 60 * 60) / 4;
          const TWO_WEEKS = WEEK * 2;

          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          startTime = await getCurrentBlockTime();
          await setTime(startTime + TWO_WEEKS);

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "0"]]);

          await setTime(startTime + TWO_WEEKS + WEEK);

          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["1"], SECOND, { from: VALIDATORS }),
            "GPC: Current credit permission < amount to withdraw"
          );

          await setTime(startTime + TWO_WEEKS + TWO_WEEKS);

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          await truffleAssert.reverts(
            govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["501"], SECOND, { from: VALIDATORS }),
            "GPC: Current credit permission < amount to withdraw"
          );

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });
          await setTime(startTime + TWO_WEEKS + TWO_WEEKS + TWO_WEEKS + 1);

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });
        });

        it("shows correct balance if withdraw amount was reduced", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["600"], { from: GOVPOOL });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "600", "100"]]);
        });

        it("shows correct balance if amount was overreduced", async () => {
          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["1000"], { from: GOVPOOL });
          await govPool.transferCreditAmount([CREDIT_TOKEN_1.address], ["500"], SECOND, { from: VALIDATORS });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "1000", "500"]]);

          await govPool.setCreditInfo([CREDIT_TOKEN_1.address], ["200"], { from: GOVPOOL });

          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN_1.address, "200", "0"]]);
        });
      });

      describe("correct proposal workflow", () => {
        let startTime;
        let CREDIT_TOKEN;

        beforeEach("setup", async () => {
          CREDIT_TOKEN = await ERC20Mock.new("Mock", "Mock", 18);
          await CREDIT_TOKEN.mint(govPool.address, wei("1000"));

          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(wei("1000"), []);
          await govPool.deposit(wei("100000000000000000000"), [], { from: SECOND });

          await govPool.createProposal(
            "example.com",

            [[govPool.address, 0, getBytesSetCreditInfo([CREDIT_TOKEN.address], [wei("1000")])]],
            []
          );

          startTime = await getCurrentBlockTime();

          await govPool.vote(1, true, wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(1);
          await validators.voteExternalProposal(1, wei("100"), true);
          await validators.voteExternalProposal(1, wei("1000000000000"), true, { from: SECOND });

          await govPool.execute(1);
        });

        it("proposal sets credit info", async () => {
          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN.address, wei("1000"), wei("1000")]]);
        });

        it("could withdraw with internal proposal", async () => {
          await createInternalProposal(
            ProposalType.MonthlyWithdraw,
            "example.com",
            [wei("777")],
            [CREDIT_TOKEN.address, SECOND],
            OWNER
          );

          const proposalId = await validators.latestInternalProposalId();
          await validators.voteInternalProposal(proposalId, wei("100"), true);
          await validators.voteInternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), "0");

          await validators.executeInternalProposal(proposalId);

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), wei("777"));
          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN.address, wei("1000"), wei("223")]]);
        });

        it("execute reverts if credit balance was dropped", async () => {
          await createInternalProposal(
            ProposalType.MonthlyWithdraw,
            "example.com",
            [wei("777")],
            [CREDIT_TOKEN.address, SECOND],
            OWNER
          );

          const proposalId = await validators.latestInternalProposalId();
          await validators.voteInternalProposal(proposalId, wei("100"), true);
          await validators.voteInternalProposal(proposalId, wei("1000000000000"), true, { from: SECOND });

          await govPool.createProposal(
            "example.com",

            [[govPool.address, 0, getBytesSetCreditInfo([CREDIT_TOKEN.address], [0])]],
            []
          );

          await govPool.vote(2, true, wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(2);
          await validators.voteExternalProposal(2, wei("100"), true);
          await validators.voteExternalProposal(2, wei("1000000000000"), true, { from: SECOND });

          await govPool.execute(2);

          await truffleAssert.reverts(validators.executeInternalProposal(proposalId), "Validators: failed to execute");
        });

        it("should correctly execute `MonthlyWithdraw` proposal", async () => {
          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Undefined);

          await createInternalProposal(
            ProposalType.MonthlyWithdraw,
            "example.com",
            [wei("777")],
            [CREDIT_TOKEN.address, SECOND],
            OWNER
          );

          await validators.voteInternalProposal(1, wei("1000000000000"), true, { from: SECOND });

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

          await setTime((await getCurrentBlockTime()) + 1);

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), "0");

          await validators.executeInternalProposal(1);

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), wei("777"));
          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN.address, wei("1000"), wei("223")]]);

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Executed);
        });
      });
    });
  });

  describe("saveOffchainResults", () => {
    const OWNER_PRIVATE_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const NOT_OWNER_PRIVATE_KEY = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    beforeEach("setup", async () => {
      const POOL_PARAMETERS = await getPoolParameters(nft.address);

      const poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;
      nftMultiplier = poolContracts.nftMultiplier;

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

      const storedHash = (await govPool.getOffchainInfo()).resultsHash;

      assert.deepEqual(resultsHash, storedHash);
    });

    it("should claim offchain rewards", async () => {
      const resultsHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
      const privateKey = Buffer.from(OWNER_PRIVATE_KEY, "hex");

      let signHash = await govPool.getOffchainSignHash(resultsHash);
      let signature = ethSigUtil.personalSign({ privateKey: privateKey, data: signHash });

      await govPool.saveOffchainResults(resultsHash, signature);

      const rewards = await govPool.getPendingRewards(OWNER, []);

      assert.deepEqual(rewards.onchainTokens, []);
      assert.deepEqual(rewards.votingRewards, []);
      assert.deepEqual(rewards.staticRewards, []);
      assert.deepEqual(rewards.offchainTokens, [rewardToken.address]);
      assert.deepEqual(
        rewards.offchainRewards.map((e) => toBN(e).toFixed()),
        [wei("5")]
      );

      assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), "0");

      await govPool.claimRewards([0], OWNER);

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

      const poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;
      nftMultiplier = poolContracts.nftMultiplier;

      await setupTokens();

      await token.mint(SECOND, wei("100000000000000000000"));
      await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

      await govPool.deposit(wei("3"), [], { from: SECOND });
    });

    it("should bypass the onlyBABT restriction if the caller is a pool", async () => {
      await impersonate(govPool.address);

      await token.mint(govPool.address, wei("1000000"));
      await token.approve(userKeeper.address, wei("1000000"), { from: govPool.address });

      assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).totalBalance.toFixed(), "0");
      assert.equal((await babt.balanceOf(govPool.address)).toFixed(), "0");

      await govPool.deposit(wei("1000000"), [], { from: govPool.address });

      assert.equal(
        (await userKeeper.tokenBalance(govPool.address, VoteType.PersonalVote)).totalBalance.toFixed(),
        wei("1000000")
      );
    });

    describe("onlyBABTHolder modifier reverts", () => {
      it("createProposal()", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []),
          REVERT_STRING
        );
      });

      it("moveProposalToValidators()", async () => {
        await truffleAssert.reverts(govPool.moveProposalToValidators(1), REVERT_STRING);
      });

      it("vote()", async () => {
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.vote(1, true, wei("100"), []), REVERT_STRING);
      });

      it("cancelVote()", async () => {
        await truffleAssert.reverts(govPool.cancelVote(1), REVERT_STRING);
      });

      it("deposit()", async () => {
        await truffleAssert.reverts(govPool.deposit(wei("1000"), []), REVERT_STRING);
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
        await truffleAssert.reverts(govPool.unlock(OWNER), REVERT_STRING);
      });

      it("execute()", async () => {
        await truffleAssert.reverts(govPool.execute(1), REVERT_STRING);
      });

      it("claimRewards()", async () => {
        await truffleAssert.reverts(govPool.claimRewards([1], OWNER), REVERT_STRING);
      });

      it("claimMicropoolRewards()", async () => {
        await truffleAssert.reverts(govPool.claimMicropoolRewards([1], OWNER, SECOND), REVERT_STRING);
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
