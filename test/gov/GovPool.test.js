const { toBN, accounts, wei, fromWei } = require("../../scripts/utils/utils");
const { solidityPow } = require("../../scripts/utils/log-exp-math");
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
  getBytesSetCreditInfo,
  getBytesChangeVoteModifiers,
  getBytesMintExpertNft,
  getBytesDelegateTreasury,
  getBytesUndelegateTreasury,
  getBytesGovVoteTreasury,
} = require("../utils/gov-pool-utils");
const {
  getBytesChangeInternalBalances,
  getBytesChangeValidatorSettings,
  getBytesMonthlyWithdraw,
} = require("../utils/gov-validators-utils");
const { ZERO_ADDR, ETHER_ADDR, PRECISION, DECIMAL } = require("../../scripts/utils/constants");
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
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC20 = artifacts.require("ERC20");
const BABTMock = artifacts.require("BABTMock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");
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
  let govPool;

  let settings2;
  let expertNft2;
  let validators2;
  let userKeeper2;
  let dp2;
  let govPool2;

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
        getBytesGovDeposit(from, depositAmount, depositNftIds),
        getBytesGovVote(proposalId, voteAmount, voteNftIds, isVoteFor),
      ],
      { from: from }
    );
  }

  async function executeAndClaim(proposalId, from) {
    await govPool.multicall([getBytesGovExecute(proposalId), getBytesGovClaimRewards([proposalId])], { from: from });
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

  async function tokensToVotes(tokenNumber) {
    return weiToVotes(wei(tokenNumber));
  }

  async function weiToVotes(tokenNumber, user = "", treasuryVote = false) {
    let voteModifier;
    if (user) {
      voteModifier = await govPool.getVoteModifierForUser(user);
    } else {
      voteModifier = (await govPool.getVoteModifiers())[0];
    }

    if (treasuryVote) {
      const treasuryVoteCoefficient = toBN(
        toBN(toBN(tokenNumber).times(PRECISION).toFixed(0))
          .idiv((await userKeeper.getTotalVoteWeight()).toFixed(0))
          .toFixed(0)
      )
        .idiv(10)
        .toFixed(0);

      voteModifier = toBN(voteModifier.minus(treasuryVoteCoefficient).toFixed());
    }

    if (voteModifier.lte(PRECISION)) {
      return toBN(tokenNumber);
    }

    return toBN(solidityPow(tokenNumber, voteModifier.times(DECIMAL).idiv(PRECISION).decimalPlaces(0)));
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

    contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    dexeExpertNft = await ERC721Expert.new();
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
    const govPool = await GovPool.new();

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
    await govPool.__GovPool_init(
      [settings.address, userKeeper.address, validators.address, expertNft.address, nftMultiplier.address],
      wei("1", 25),
      wei("1", 25),
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
      govPool: govPool,
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
              voteForRewardsCoefficient: PRECISION.toFixed(),
              voteAgainstRewardsCoefficient: PRECISION.toFixed(),
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
              voteForRewardsCoefficient: PRECISION.toFixed(),
              voteAgainstRewardsCoefficient: PRECISION.toFixed(),
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
              voteForRewardsCoefficient: PRECISION.toFixed(),
              voteAgainstRewardsCoefficient: PRECISION.toFixed(),
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
              voteForRewardsCoefficient: PRECISION.toFixed(),
              voteAgainstRewardsCoefficient: PRECISION.toFixed(),
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

    for (let i = 1; i < 10; i++) {
      await nft.safeMint(OWNER, i);
      await nft.approve(userKeeper.address, i);
    }

    await rewardToken.mint(govPool.address, wei("10000000000000000000000"));
  }

  async function setNftMultiplierAddress(addr) {
    const bytesSetAddress = getBytesSetNftMultiplierAddress(addr);

    await govPool.createProposal("example.com", [[govPool.address, 0, bytesSetAddress]], []);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, wei("1000"), [], true);
    await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

    await govPool.moveProposalToValidators(proposalId);
    await validators.vote(proposalId, wei("100"), false, true);
    await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });

    await govPool.execute(proposalId);
  }

  async function changeVoteModifiers(regularModifier, expertModifier, voteFoo = null) {
    const bytesChangeVoteModifiers = getBytesChangeVoteModifiers(regularModifier, expertModifier);

    await govPool.createProposal("example.com", [[govPool.address, 0, bytesChangeVoteModifiers]], []);

    const proposalId = await govPool.latestProposalId();

    if (voteFoo) {
      await voteFoo(proposalId);
    } else {
      await govPool.vote(proposalId, wei("1000"), [], true);
      await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

      if ((await govPool.getProposalState(proposalId)) == ProposalState.Voting) {
        await govPool.vote(proposalId, wei("24999900000000000000000000"), [], true, {
          from: SECOND,
        });
      }

      await govPool.moveProposalToValidators(proposalId);
      await validators.vote(proposalId, wei("100"), false, true);
      await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
    }

    await govPool.execute(proposalId);
  }

  async function setExpert(addr, voteFoo = null) {
    const bytesMint = getBytesMintExpertNft(addr, "URI");
    await govPool.createProposal("example.com", [[expertNft.address, 0, bytesMint]], []);

    const proposalId = await govPool.latestProposalId();
    if (voteFoo) {
      await voteFoo(proposalId);
    } else {
      await govPool.vote(proposalId, wei("1000"), [], true);
      await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

      if ((await govPool.getProposalState(proposalId)) == ProposalState.Voting) {
        const balance = await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote);
        const availableBalance = toBN(balance[0]).minus(balance[1]).minus(wei("100000000000000000000"));

        if (availableBalance.gt("0")) {
          await govPool.vote(proposalId, availableBalance, [], true, {
            from: SECOND,
          });
        }
      }

      await setTime((await getCurrentBlockTime()) + 999);

      await govPool.moveProposalToValidators(proposalId);
      await validators.vote(proposalId, wei("100"), false, true);
      await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
    }

    await govPool.execute(proposalId);
  }

  async function delegateTreasury(addr, amount, nftIds) {
    if (!(await govPool.getExpertStatus(addr))) {
      await setExpert(addr);
    }

    await token.mint(govPool.address, amount);

    for (let i of nftIds) {
      await nft.safeMint(govPool.address, i);
    }

    const bytesDelegateTreasury = getBytesDelegateTreasury(addr, amount, nftIds);

    await govPool.createProposal("example.com", [[govPool.address, 0, bytesDelegateTreasury]], []);

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, wei("1000"), [], true);
    await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

    if ((await govPool.getProposalState(proposalId)) == ProposalState.Voting) {
      const balance = await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote);
      await govPool.vote(proposalId, toBN(balance[0]).minus(balance[1]).minus(wei("100000000000000000000")), [], true, {
        from: SECOND,
      });
    }

    await govPool.moveProposalToValidators(proposalId);
    await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
    await govPool.execute(proposalId);
  }

  async function undelegateTreasury(addr, amount, nftIds) {
    const bytesUndelegateTreasury = getBytesUndelegateTreasury(addr, amount, nftIds);
    const bytesUndelegateTreasuryThird = getBytesUndelegateTreasury(THIRD, amount, []);

    await govPool.createProposal(
      "example.com",

      [
        [govPool.address, 0, bytesUndelegateTreasury],
        [govPool.address, 0, bytesUndelegateTreasuryThird],
      ],
      []
    );

    const proposalId = await govPool.latestProposalId();

    await govPool.vote(proposalId, wei("1000"), [], true);
    await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

    if ((await govPool.getProposalState(proposalId)) == ProposalState.Voting) {
      const balance = await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote);
      await govPool.vote(proposalId, toBN(balance[0]).minus(balance[1]).minus(wei("100000000000000000000")), [], true, {
        from: SECOND,
      });
    }

    await govPool.moveProposalToValidators(proposalId);
    await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
    await govPool.execute(proposalId);
  }

  const assertBalanceDistribution = (balances, coefficients, tolerance) => {
    for (let i = 0; i < balances.length - 1; i++) {
      const epsilon = coefficients[i] + coefficients[i + 1];

      const lhs = balances[i].idiv(wei("1")).times(coefficients[i + 1]);
      const rhs = balances[i + 1].idiv(wei("1")).times(coefficients[i]);

      assert.closeTo(lhs.toNumber(), rhs.toNumber(), tolerance + epsilon);
    }
  };

  const assertNoZerosBalanceDistribution = (balances, coefficients, tolerance = 0) => {
    balances.forEach((balance) => assert.notEqual(balance.toFixed(), "0"));

    assertBalanceDistribution(balances, coefficients, tolerance);
  };

  describe("Fullfat GovPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = await getPoolParameters(nft.address);

      let poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;

      poolContracts = await deployPool(POOL_PARAMETERS);
      settings2 = poolContracts.settings;
      govPool2 = poolContracts.govPool;
      userKeeper2 = poolContracts.userKeeper;
      validators2 = poolContracts.validators;
      dp2 = poolContracts.distributionProposal;
      expertNft2 = poolContracts.expertNft;

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
            [settings.address, userKeeper.address, validators.address, expertNft.address, nftMultiplier.address],
            wei("1.3", 25),
            wei("1.132", 25),
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
      it("should deposit tokens", async () => {
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("100000000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("100000000000")
        );

        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(), "9");
        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(), "9");

        await govPool.deposit(OWNER, wei("100"), [1, 2, 3]);

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("100000000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("99999999900")
        );

        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(), "9");
        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(), "6");
      });
    });

    describe("request(),", () => {
      it.skip("should deposit tokens", async () => {
        await govPool.deposit(OWNER, wei("100"), [1, 2, 3]);

        await govPool.delegate(OWNER, wei("100"), [1, 2, 3]);

        await govPool.request(OWNER, wei("50"), [1, 2]);

        assert.equal((await userKeeper.tokenBalance(OWNER, VoteType.MicropoolVote)).totalBalance.toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalance(OWNER, VoteType.MicropoolVote)).ownedBalance.toFixed(), wei("50"));

        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.MicropoolVote)).totalBalance.toFixed(), "3");
        assert.equal((await userKeeper.nftBalance(OWNER, VoteType.MicropoolVote)).ownedBalance.toFixed(), "2");
      });
    });

    describe.skip("unlock()", () => {
      let startTime;

      beforeEach("setup", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("example.com", [[THIRD, 0, getBytesApprove(SECOND, 1)]], []);

        startTime = await getCurrentBlockTime();

        await govPool.vote(1, wei("100"), [2], true);
        await govPool.vote(2, wei("50"), [], true);
      });

      it("should unlock all", async () => {
        const beforeUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(beforeUnlock.tokens.toFixed(), wei("900"));
        assert.deepEqual(
          beforeUnlock.nfts.map((e) => e.toFixed()),
          ["1", "3", "4"]
        );

        await setTime(startTime + 1000);
        await govPool.unlock(OWNER, VoteType.PersonalVote);

        const afterUnlock = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(afterUnlock.tokens.toFixed(), wei("1000"));
        assert.deepEqual(
          afterUnlock.nfts.map((e) => e.toFixed()),
          ["1", "2", "3", "4"]
        );
      });

      it("should revert if pass wrong vote type", async () => {
        await truffleAssert.reverts(govPool.unlock(OWNER, VoteType.DelegatedVote), "Gov: invalid vote type");
      });
    });

    describe("createProposal()", () => {
      beforeEach("", async () => {
        await govPool.deposit(OWNER, 1, [1]);
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

      it.skip("should create 2 proposals", async () => {
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

      describe("with action against", () => {
        it("should not create proposal due to different length", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [
                [govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)],
                [govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)],
              ],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              { from: SECOND }
            ),
            "Gov: invalid actions length"
          );

          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [
                [govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)],
                [govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)],
              ],
              { from: SECOND }
            ),
            "Gov: invalid actions length"
          );
        });

        it("should not create proposal due invalid executor", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
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

              [[govPool2.address, 0, getBytesGovExecute(1)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              { from: SECOND }
            ),
            "Gov: invalid selector"
          );

          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovExecute(1)]],
              [[govPool2.address, 0, getBytesGovExecute(1)]],
              { from: SECOND }
            ),
            "Gov: invalid selector"
          );
        });

        it.skip("should create proposal with appropriate selectors", async () => {
          await dexeExpertNft.mint(SECOND, "");

          assert.isOk(
            await govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              { from: SECOND }
            )
          );

          assert.isOk(
            await govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVoteDelegated(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVoteDelegated(1, wei("1"), [], false)]],
              { from: SECOND }
            )
          );

          assert.isOk(
            await govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVoteTreasury(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVoteTreasury(1, wei("1"), [], false)]],
              { from: SECOND }
            )
          );
        });

        it.skip("should not create proposal due to different proposalId", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVote(2, wei("1"), [], false)]],
              { from: SECOND }
            ),
            "Gov: invalid proposal id"
          );
        });

        it.skip("should not create proposal due to invalid vote", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              { from: SECOND }
            ),
            "Gov: invalid vote"
          );

          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              { from: SECOND }
            ),
            "Gov: invalid vote"
          );

          await truffleAssert.reverts(
            govPool.createProposal(
              "",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              { from: SECOND }
            ),
            "Gov: invalid vote"
          );
        });
      });

      it("should create proposal if user is Expert even due to low voting power", async () => {
        await dexeExpertNft.mint(SECOND, "");

        assert.isOk(await govPool.createProposal("", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], { from: SECOND }));
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

      describe("DP", () => {
        it("should revert when creating DP proposal with wrong proposal id", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",

              [[dp.address, 0, getBytesDistributionProposal(2, token.address, wei("100"))]],
              []
            ),
            "Gov: invalid proposalId"
          );
        });

        it("should revert when creating DP proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",

              [
                [token.address, 1, getBytesApprove(dp.address, wei("100"))],
                [dp.address, 0, getBytesDistributionProposal(1, token.address, wei("100"))],
              ],
              []
            ),
            "Gov: invalid internal data"
          );
        });
      });

      describe.skip("internal", () => {
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

      describe.skip("existing", () => {
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
            voteForRewardsCoefficient: 0,
            voteAgainstRewardsCoefficient: 0,
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

          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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
              [THIRD, 0, getBytesAddSettings([NEW_SETTINGS])],
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

    describe("voting", () => {
      beforeEach("setup", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("example.com", [[THIRD, 0, getBytesApprove(SECOND, 1)]], []);
      });

      describe.skip("vote() tokens", () => {
        it("should vote for two proposals", async () => {
          await govPool.vote(1, wei("70"), [], true);
          await govPool.vote(1, wei("30"), [], false);
          await govPool.vote(2, wei("50"), [], false);

          let proposal = await getProposalByIndex(1);

          assert.equal(proposal.descriptionURL, "example.com");
          assert.equal(proposal.core.votesFor, (await tokensToVotes(70)).toFixed());
          assert.equal(proposal.core.votesAgainst, (await tokensToVotes(30)).toFixed());

          proposal = await getProposalByIndex(2);

          assert.equal(proposal.core.votesFor, "0");
          assert.equal(proposal.core.votesAgainst, (await tokensToVotes(50)).toFixed());

          const voteInfo = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

          assert.equal(voteInfo.totalVotedFor, (await tokensToVotes(70)).toFixed());
          assert.equal(voteInfo.totalVotedAgainst, (await tokensToVotes(30)).toFixed());
          assert.equal(voteInfo.tokensVotedFor, wei("70"));
          assert.equal(voteInfo.tokensVotedAgainst, wei("30"));
          assert.deepEqual(voteInfo.nftsVotedFor, []);
          assert.deepEqual(voteInfo.nftsVotedAgainst, []);
        });

        it("should not vote if votes limit is reached", async () => {
          await coreProperties.setGovVotesLimit(0);

          await truffleAssert.reverts(govPool.vote(1, wei("100"), [], true), "Gov: vote limit reached");
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, wei("100"), [], true);
          assert.equal((await getProposalByIndex(1)).core.votesFor, (await tokensToVotes(100)).toFixed());

          await govPool.vote(1, wei("100"), [], true);
          assert.equal((await getProposalByIndex(1)).core.votesFor, (await tokensToVotes(100)).times(2).toFixed());
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], true), "Gov: empty vote");
        });
      });

      describe.skip("voteDelegated() tokens", () => {
        beforeEach("setup", async () => {
          await govPool.delegate(SECOND, wei("500"), []);
          await govPool.delegate(THIRD, wei("500"), []);
        });

        it("should vote delegated tokens for two proposals", async () => {
          await govPool.voteDelegated(1, wei("70"), [], true, { from: SECOND });
          await govPool.voteDelegated(1, wei("30"), [], false, { from: SECOND });
          await govPool.voteDelegated(2, wei("50"), [], true, { from: THIRD });

          let proposal = await getProposalByIndex(1);

          assert.equal(proposal.core.votesFor, (await tokensToVotes(70)).toFixed());
          assert.equal(proposal.core.votesAgainst, (await tokensToVotes(30)).toFixed());

          proposal = await getProposalByIndex(2);

          assert.equal(proposal.core.votesFor, (await tokensToVotes(50)).toFixed());
          assert.equal(proposal.core.votesAgainst, "0");

          const voteInfo = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

          assert.equal(voteInfo.totalVotedFor, (await tokensToVotes(70)).toFixed());
          assert.equal(voteInfo.totalVotedAgainst, (await tokensToVotes(30)).toFixed());
          assert.equal(voteInfo.tokensVotedFor, wei("70"));
          assert.equal(voteInfo.tokensVotedAgainst, wei("30"));
          assert.deepEqual(voteInfo.nftsVotedFor, []);
          assert.deepEqual(voteInfo.nftsVotedAgainst, []);
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegated(1, wei("100"), [], true, { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, (await tokensToVotes(100)).toFixed());

          await govPool.voteDelegated(1, wei("100"), [], true, { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, (await tokensToVotes(100)).times(2).toFixed());

          const total = await govPool.getTotalVotes(1, SECOND, VoteType.MicropoolVote);

          assert.equal(toBN(total[0]).toFixed(), (await tokensToVotes(100)).times(2).toFixed());
          assert.equal(toBN(total[1]).toFixed(), "0");
          assert.equal(toBN(total[2]).toFixed(), (await tokensToVotes(100)).times(2).toFixed());
          assert.equal(toBN(total[3]).toFixed(), "0");
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegated(1, wei("500"), [], true, { from: SECOND });
          assert.equal((await getProposalByIndex(1)).core.votesFor, (await tokensToVotes(500)).toFixed());
        });

        it("should revert when vote is zero amount", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegated(1, 0, [], true, { from: SECOND }),
            "Gov: empty delegated vote"
          );
        });

        it("should revert when spending undelegated tokens", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 1, [], true, { from: FOURTH }), "Gov: low voting power");
        });

        it("should revert if voting with amount exceeding delegation", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegated(1, wei("1000"), [], true, { from: SECOND }),
            "Gov: wrong vote amount"
          );
        });
      });

      describe.skip("if high minVotingPower", () => {
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
            executionDelay: 0,
            rewardsInfo: {
              rewardToken: rewardToken.address,
              creationReward: wei("10"),
              executionReward: wei("5"),
              voteForRewardsCoefficient: PRECISION.toFixed(),
              voteAgainstRewardsCoefficient: PRECISION.toFixed(),
            },
            executorDescription: "new_internal_settings",
          };

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("100"), false, true);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(3);

          await nft.safeMint(OWNER, 10);

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        });

        describe("vote() nfts", () => {
          const SINGLE_NFT_COST = toBN("3666666666666666666666");
          let SINGLE_NFT_POWER;

          beforeEach("setup", async () => {
            SINGLE_NFT_POWER = await weiToVotes(SINGLE_NFT_COST);
          });

          it("should vote for two proposals", async () => {
            await govPool.vote(1, 0, [1], true);
            await govPool.vote(2, 0, [2], true);
            await govPool.vote(2, 0, [3], false);

            let proposal = await getProposalByIndex(1);

            assert.equal(proposal.core.votesFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(proposal.core.votesAgainst, "0");

            proposal = await getProposalByIndex(2);

            assert.equal(proposal.core.votesFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(proposal.core.votesAgainst, SINGLE_NFT_POWER.toFixed());

            let voteInfo = await govPool.getUserVotes(1, OWNER, VoteType.PersonalVote);

            assert.equal(voteInfo.totalVotedFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(voteInfo.totalVotedAgainst, "0");
            assert.equal(voteInfo.tokensVotedFor, "0");
            assert.equal(voteInfo.tokensVotedAgainst, "0");
            assert.deepEqual(voteInfo.nftsVotedFor, ["1"]);
            assert.deepEqual(voteInfo.nftsVotedAgainst, []);

            voteInfo = await govPool.getUserVotes(2, OWNER, VoteType.PersonalVote);

            assert.equal(voteInfo.totalVotedFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(voteInfo.totalVotedAgainst, SINGLE_NFT_POWER.toFixed());
            assert.equal(voteInfo.tokensVotedFor, "0");
            assert.equal(voteInfo.tokensVotedAgainst, "0");
            assert.deepEqual(voteInfo.nftsVotedFor, ["2"]);
            assert.deepEqual(voteInfo.nftsVotedAgainst, ["3"]);
          });

          it("should vote for proposal twice", async () => {
            await govPool.vote(1, 0, [1], true);

            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_POWER.toFixed());

            await govPool.vote(1, 0, [2, 3], true);

            assert.equal(
              toBN((await getProposalByIndex(1)).core.votesFor)
                .idiv(3)
                .toFixed(),
              SINGLE_NFT_POWER.toFixed()
            );
          });

          it("should revert when voting with same NFTs", async () => {
            await truffleAssert.reverts(govPool.vote(1, 0, [2, 2], true), "Gov: NFT already voted");

            await govPool.vote(1, 0, [2], true);

            await truffleAssert.reverts(govPool.vote(1, 0, [2], true), "Gov: NFT already voted");

            await truffleAssert.reverts(govPool.vote(1, 0, [2], false), "Gov: NFT already voted");
          });
        });

        describe("voteDelegated() nfts", () => {
          const SINGLE_NFT_COST = toBN("3666666666666666666666");
          let SINGLE_NFT_POWER;

          beforeEach("setup", async () => {
            SINGLE_NFT_POWER = await weiToVotes(SINGLE_NFT_COST);

            await govPool.delegate(SECOND, wei("500"), [1]);
            await govPool.delegate(THIRD, wei("500"), [2, 3]);
          });

          it("should vote delegated nfts for two proposals", async () => {
            await govPool.voteDelegated(1, 0, [1], true, { from: SECOND });
            await govPool.voteDelegated(2, 0, [2, 3], true, { from: THIRD });

            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(
              toBN((await getProposalByIndex(2)).core.votesFor)
                .idiv(2)
                .toFixed(),
              SINGLE_NFT_POWER.toFixed()
            );

            const voteInfo = await govPool.getUserVotes(1, SECOND, VoteType.MicropoolVote);

            assert.equal(voteInfo.totalVotedFor, SINGLE_NFT_POWER.toFixed());
            assert.equal(voteInfo.totalVotedAgainst, "0");
            assert.equal(voteInfo.tokensVotedFor, "0");
            assert.equal(voteInfo.tokensVotedAgainst, "0");
            assert.deepEqual(voteInfo.nftsVotedFor, ["1"]);
            assert.deepEqual(voteInfo.nftsVotedAgainst, []);
          });

          it("should vote delegated nfts twice", async () => {
            await govPool.voteDelegated(1, 0, [2], true, { from: THIRD });
            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_POWER.toFixed());

            await govPool.voteDelegated(1, 0, [3], true, { from: THIRD });
            assert.equal((await getProposalByIndex(1)).core.votesFor, SINGLE_NFT_POWER.times(2).toFixed());
          });

          it("should revert when spending undelegated nfts", async () => {
            await truffleAssert.reverts(
              govPool.voteDelegated(1, 0, [1], true, { from: FOURTH }),
              "Gov: low voting power"
            );
          });

          it("should revert when voting with not delegated nfts", async () => {
            await truffleAssert.reverts(
              govPool.voteDelegated(1, 0, [2], true, { from: SECOND }),
              "GovUK: NFT is not owned"
            );
          });

          it("should revert if nft was requested", async () => {
            await govPool.request(SECOND, 0, [1]);

            await truffleAssert.reverts(
              govPool.voteDelegated(1, 0, [1], true, { from: SECOND }),
              "GovUK: NFT is not owned or requested"
            );
          });
        });
      });

      describe("getProposalState()", () => {
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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: 0,
            executionReward: 0,
            voteForRewardsCoefficient: 0,
            voteAgainstRewardsCoefficient: 0,
          },
          executorDescription: "new_settings",
        };

        beforeEach(async () => {
          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(OWNER, wei("1000"), []);
          await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
        });

        it("should return Undefined when proposal doesn't exist", async () => {
          assert.equal(await govPool.getProposalState(3), ProposalState.Undefined);
        });

        async function disableValidatorsVote() {
          const NEW_SETTINGS = {
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
              creationReward: 0,
              executionReward: 0,
              voteForRewardsCoefficient: 0,
              voteAgainstRewardsCoefficient: 0,
            },
            executorDescription: "new_settings",
          };

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([0, 1], [NEW_SETTINGS, NEW_SETTINGS])]],
            []
          );
          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });
          await govPool.moveProposalToValidators(3);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(3);
        }

        it.skip("should return ExecutedFor state", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([1], [NEW_SETTINGS])]],
            []
          );
          await govPool.vote(4, wei("100000000000000000000"), [], true, { from: SECOND });

          await govPool.execute(4);

          assert.equal(await govPool.getProposalState(4), ProposalState.ExecutedFor);
        });

        it.skip("should return ExecutedAgainst state", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );
          await govPool.vote(4, wei("100000000000000000000"), [], false, { from: SECOND });

          await token.mint(SECOND, wei("10"));
          await token.approve(userKeeper2.address, wei("10"), { from: SECOND });
          await govPool2.deposit(govPool.address, wei("10"), [], { from: SECOND });
          await dexeExpertNft.mint(OWNER, "");

          await govPool2.createProposal(
            "example.com",

            [[settings2.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );

          await govPool.execute(4);

          assert.equal(await govPool.getProposalState(4), ProposalState.ExecutedAgainst);
        });

        it("should return Voting state", async () => {
          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          assert.equal(await govPool.getProposalState(1), ProposalState.Voting);
        });

        it("should return Defeated state when quorum has not reached", async () => {
          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          await setTime((await getCurrentBlockTime()) + 1000000);

          assert.equal(await govPool.getProposalState(1), ProposalState.Defeated);
        });

        it.skip("should return Defeated state when quorum has reached but vote result is against and no actions against", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          await govPool.vote(4, wei("100000000000000000000"), [], false, { from: SECOND });

          assert.equal(await govPool.getProposalState(4), ProposalState.Defeated);
        });

        it.skip("should return SucceededFor state when quorum has reached and vote result is for and without validators", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          await govPool.vote(4, wei("100000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 1);

          assert.equal(await govPool.getProposalState(4), ProposalState.SucceededFor);
        });

        it.skip("should return SucceededAgainst state when quorum has reached and vote result is against and without validators", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(4, wei("100000000000000000000"), [], false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 1);

          assert.equal(await govPool.getProposalState(4), ProposalState.SucceededAgainst);
        });

        it.skip("should return WaitingForVotingTransfer state when quorum has reached and votes for and with validators", async () => {
          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          assert.isTrue((await validators.validatorsCount()).toFixed() != 0);
          assert.equal(await govPool.getProposalState(3), ProposalState.WaitingForVotingTransfer);
        });

        it.skip("should return WaitingForVotingTransfer state when quorum has reached and votes against and with validators", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.isTrue((await validators.validatorsCount()).toFixed() != 0);
          assert.equal(await govPool.getProposalState(3), ProposalState.WaitingForVotingTransfer);
        });

        it.skip("should return SucceededFor state when quorum has reached and votes for and with validators but there count is 0", async () => {
          await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);
          await validators.vote(1, wei("1000000000000"), true, true, { from: SECOND });

          await validators.execute(1);

          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          assert.equal((await validators.validatorsCount()).toFixed(), "0");

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.SucceededFor);
        });

        it.skip("should return SucceededAgainst state when quorum has reached and votes for and with validators but there count is 0", async () => {
          await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);
          await validators.vote(1, wei("1000000000000"), true, true, { from: SECOND });

          await validators.execute(1);

          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

          assert.equal((await validators.validatorsCount()).toFixed(), "0");

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.SucceededAgainst);
        });

        it.skip("should return ValidatorVoting state when quorum has reached and votes for and with validators", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          assert.equal(await govPool.getProposalState(3), ProposalState.ValidatorVoting);
        });

        it.skip("should return Locked state when quorum has reached and votes for and without validators", async () => {
          await disableValidatorsVote();

          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(4, wei("100000000000000000000"), [], true, { from: SECOND });

          assert.equal(await govPool.getProposalState(4), ProposalState.Locked);
        });

        it.skip("should return Locked state when quorum has reached and votes for and with validators voted successful", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("100"), false, true);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          assert.equal(await govPool.getProposalState(3), ProposalState.Locked);
        });

        it.skip("should return SucceededFor state when quorum has reached and votes for and with validators voted successful", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("100"), false, true);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.SucceededFor);
        });

        it.skip("should return SucceededAgainst state when quorum has reached and votes for and with validators voted successful", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("100"), false, true);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.SucceededAgainst);
        });

        it.skip("should return Defeated state when quorum has reached and votes for and with validators voted against", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("1000000000000"), false, false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
        });

        it.skip("should return Defeated state when quorum has reached and votes against and with validators voted against", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("1000000000000"), false, false, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: 0,
            executionReward: 0,
            voteForRewardsCoefficient: 0,
            voteAgainstRewardsCoefficient: 0,
          },
          executorDescription: "new_settings",
        };

        let startTime;

        beforeEach("setup", async () => {
          startTime = await getCurrentBlockTime();

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([3], [NEW_SETTINGS])]],
            []
          );

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
        });

        it.skip("should move proposal to validators", async () => {
          await govPool.createProposal(
            "example.com",

            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
            [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
          );

          await depositAndVote(4, wei("1000"), [], wei("1000"), [], OWNER, false);
          await depositAndVote(4, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND, false);

          await setTime((await getCurrentBlockTime()) + 10000);

          const proposal = await getProposalByIndex(4);

          await govPool.moveProposalToValidators(4);

          const afterMove = await validators.getExternalProposal(4);

          assert.equal(await govPool.getProposalState(4), ProposalState.ValidatorVoting);

          assert.equal(proposal.core.executed, afterMove.core.executed);
          assert.equal(proposal.core.settings.quorumValidators, afterMove.core.quorum);

          await validators.vote(4, wei("100"), false, true);
          await validators.vote(4, wei("1000000000000"), false, true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          assert.equal(await govPool.getProposalState(4), ProposalState.SucceededAgainst);
        });

        it.skip("should be rejected by validators", async () => {
          await depositAndVote(3, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          await govPool.moveProposalToValidators(3);

          await setTime(startTime + 1000000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
        });

        it.skip("should revert when try move without vote", async () => {
          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
        });

        it.skip("should revert when validators count is zero", async () => {
          await depositAndVote(3, wei("1000"), [], wei("1000"), [], OWNER);
          await depositAndVote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], SECOND);

          assert.equal((await govPool.getProposalState(3)).toFixed(), ProposalState.WaitingForVotingTransfer);

          await createInternalProposal(ProposalType.ChangeBalances, "", [0, 0], [OWNER, SECOND]);
          await validators.vote(1, wei("1000000000000"), true, true, { from: SECOND });

          await validators.execute(1);

          assert.equal((await validators.validatorsCount()).toFixed(), "0");
          assert.equal((await govPool.getProposalState(3)).toFixed(), ProposalState.SucceededFor);

          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "Gov: can't be moved");
        });
      });

      describe("canVote()", () => {
        beforeEach("setup", async () => {
          await token.mint(SECOND, wei("200000000000000000000"));
          await token.approve(userKeeper.address, wei("200000000000000000000"), { from: SECOND });
          await govPool.deposit(SECOND, wei("200000000000000000000"), [], { from: SECOND });

          await token.mint(THIRD, wei("1000"));
          await token.approve(userKeeper.address, wei("1000"), { from: THIRD });
          await govPool.deposit(THIRD, wei("1000"), [], { from: THIRD });
        });

        it.skip("should correctly determine use vote ability when delegatedVotingAllowed is true", async () => {
          const NEW_SETTINGS = {
            earlyCompletion: true,
            delegatedVotingAllowed: true,
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
              voteForRewardsCoefficient: 0,
              voteAgainstRewardsCoefficient: 0,
            },
            executorDescription: "new_settings",
          };

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([1], [NEW_SETTINGS])]],
            []
          );

          await govPool.vote(3, wei("200000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);
          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.execute(3);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );

          await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);

          assert.isTrue((await getProposalByIndex(4))[0][0].delegatedVotingAllowed);

          assert.isOk(await govPool.vote(4, wei("1000"), [], true));
          await truffleAssert.reverts(
            govPool.voteDelegated(4, wei("1000"), [], true, { from: SECOND }),
            "Gov: micropool voting is off"
          );
        });

        it.skip("should correctly determine use vote ability when delegatedVotingAllowed is false", async () => {
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
              voteForRewardsCoefficient: 0,
              voteAgainstRewardsCoefficient: 0,
            },
            executorDescription: "new_settings",
          };

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesEditSettings([1], [NEW_SETTINGS])]],
            []
          );

          await govPool.vote(3, wei("200000000000000000000"), [], true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(3);

          await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.execute(3);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );

          assert.isFalse((await getProposalByIndex(4))[0][0].delegatedVotingAllowed);

          await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);
          await truffleAssert.reverts(govPool.vote(4, wei("1000"), [], true), "Gov: wrong vote amount");
          await govPool.voteDelegated(4, wei("1000"), [], true, { from: SECOND });
        });

        describe.skip("when action is For", () => {
          it("should restrict user when proposal is undelegateTreasury", async () => {
            await delegateTreasury(SECOND, wei("100"), ["10", "11"]);

            await truffleAssert.reverts(
              undelegateTreasury(SECOND, wei("100"), ["10"], true),
              "Gov: user restricted from voting in this proposal"
            );

            await truffleAssert.reverts(
              govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: THIRD }),
              "Gov: user restricted from voting in this proposal"
            );

            await truffleAssert.reverts(
              govPool.vote(await govPool.latestProposalId(), wei("100"), [], false, { from: THIRD }),
              "Gov: user restricted from voting in this proposal"
            );

            await token.mint(OWNER, wei("1000"));
            await token.approve(userKeeper.address, wei("1000"), { from: OWNER });
            await govPool.deposit(OWNER, wei("1000"), [], { from: OWNER });

            assert.isOk(await govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: OWNER }));

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            assert.isOk(await govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: SECOND }));
          });
        });

        describe.skip("when action is Against", () => {
          it("should restrict user when proposal is undelegateTreasury", async () => {
            await delegateTreasury(SECOND, wei("100"), ["10", "11"]);

            await truffleAssert.reverts(
              undelegateTreasury(SECOND, wei("100"), ["10"], false),
              "Gov: user restricted from voting in this proposal"
            );

            await truffleAssert.reverts(
              govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: THIRD }),
              "Gov: user restricted from voting in this proposal"
            );

            await token.mint(OWNER, wei("1000"));
            await token.approve(userKeeper.address, wei("1000"), { from: OWNER });
            await govPool.deposit(OWNER, wei("1000"), [], { from: OWNER });

            assert.isOk(await govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: OWNER }));

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            assert.isOk(await govPool.vote(await govPool.latestProposalId(), wei("100"), [], true, { from: SECOND }));
          });
        });
      });
    });

    describe("deposit, vote, withdraw", () => {
      it.skip("should deposit, vote and withdraw tokens", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await token.mint(SECOND, wei("1000"));
        await token.approve(userKeeper.address, wei("1000"), { from: SECOND });

        await depositAndVote(1, wei("1000"), [], wei("500"), [], SECOND);

        let withdrawable = await govPool.getWithdrawableAssets(SECOND, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("500"));
        assert.equal(withdrawable.nfts.length, "0");

        await govPool.vote(1, wei("1000"), [1, 2, 3, 4], true);

        await truffleAssert.reverts(govPool.vote(1, 0, [1, 4], true), "Gov: NFT already voted");

        await setTime((await getCurrentBlockTime()) + 10000);

        withdrawable = await govPool.getWithdrawableAssets(SECOND, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), wei("1000"));
        assert.equal(withdrawable.nfts.length, "0");

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), "0");

        await govPool.withdraw(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.withdraw(OWNER, 0, [1]);

        assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it.skip("should deposit, vote, unlock", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.vote(1, wei("1000"), [1, 2, 3, 4], true);
        await govPool.vote(2, wei("510"), [1, 2], true);

        let withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");

        await govPool.unlock(OWNER, VoteType.PersonalVote);

        withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");

        await setTime((await getCurrentBlockTime()) + 10000);

        await govPool.unlock(OWNER, VoteType.PersonalVote);

        await govPool.withdraw(OWNER, wei("510"), [1]);

        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it.skip("should deposit, vote, unlock with vote against", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal(
          "example.com",

          [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
          [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
        );

        await govPool.vote(1, wei("1000"), [1, 2, 3, 4], false);

        let withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");

        await govPool.unlock(OWNER, VoteType.PersonalVote);

        withdrawable = await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR);

        assert.equal(toBN(withdrawable.tokens).toFixed(), "0");
        assert.equal(withdrawable.nfts.length, "0");
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

    describe.skip("deposit, delegate, vote, withdraw", () => {
      it("should deposit, delegate, vote delegated, undelegate and withdraw nfts", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

        await govPool.delegate(SECOND, wei("250"), [2]);
        await govPool.delegate(SECOND, wei("250"), []);
        await govPool.delegate(SECOND, 0, [4]);

        await govPool.voteDelegated(1, wei("400"), [4], true, { from: SECOND });

        let undelegateable = await govPool.getWithdrawableAssets(OWNER, SECOND);

        assert.equal(toBN(undelegateable.tokens).toFixed(), wei("100"));
        assert.deepEqual(
          undelegateable.nfts.map((e) => e.toFixed()),
          ["2"]
        );

        await govPool.vote(1, wei("500"), [1, 3], true);

        await setTime((await getCurrentBlockTime()) + 10000);

        undelegateable = await govPool.getWithdrawableAssets(OWNER, SECOND);

        assert.equal(toBN(undelegateable.tokens).toFixed(), wei("500"));
        assert.deepEqual(
          undelegateable.nfts.map((e) => e.toFixed()),
          ["2", "4"]
        );

        await govPool.undelegate(SECOND, wei("250"), [2]);
        await govPool.undelegate(SECOND, wei("250"), []);
        await govPool.undelegate(SECOND, 0, [4]);

        await govPool.withdraw(OWNER, wei("1000"), [1, 2, 3, 4]);
      });
    });

    describe.skip("execute()", () => {
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
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
        },
        executorDescription: "new_settings",
      };

      const NEW_INTERNAL_SETTINGS = {
        earlyCompletion: true,
        delegatedVotingAllowed: true,
        validatorsVote: true,
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
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
        },
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

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR)).tokens.toFixed(), "0");

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        assert.equal((await govPool.getWithdrawableAssets(OWNER, ZERO_ADDR)).tokens.toFixed(), 0);

        await setTime((await getCurrentBlockTime()) + 1);

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
        assert.equal(addedSettings.executionDelay, 101);

        assert.isTrue((await getProposalByIndex(1)).core.executed);
      });

      it("should not execute random proposals", async () => {
        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should change settings then full vote", async () => {
        const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(1);

        await govPool.deposit(OWNER, 0, [1, 2, 3, 4]);
        await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(2, wei("1000"), [1, 2, 3, 4], true);
        await truffleAssert.reverts(
          govPool.voteDelegated(2, wei("1000"), [1, 2, 3, 4], true, { from: SECOND }),
          "Gov: micropool voting is off"
        );
      });

      it("should change validator balances through execution", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(1);

        await truffleAssert.reverts(govPool.vote(1, wei("1000"), [], true), "Gov: vote unavailable");

        const validatorsToken = await ERC20Mock.at(await validators.govValidatorsToken());

        assert.equal((await validatorsToken.balanceOf(THIRD)).toFixed(), wei("10"));
      });

      it("should not execute defeated proposal", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);

        await setTime((await getCurrentBlockTime()) + 100000);

        await truffleAssert.reverts(govPool.execute(1), "Gov: invalid status");
      });

      it("should not execute defeated because of against votes", async () => {
        const validatorsBytes = getBytesChangeBalances([wei("10")], [THIRD]);

        await govPool.createProposal("example.com", [[validators.address, 0, validatorsBytes]], []);

        await govPool.vote(1, wei("1000"), [], false);
        await govPool.vote(1, wei("100000000000000000000"), [], false, { from: SECOND });

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

        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await setTime(startTime + 999);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await truffleAssert.reverts(govPool.execute(1), "ERC20: insufficient allowance");
      });

      describe("self execution", () => {
        describe("editDescriptionURL()", () => {
          it.skip("should create proposal for editDescriptionURL", async () => {
            const newUrl = "new_url";
            const bytesEditUrl = getBytesEditUrl(newUrl);

            await govPool.createProposal("example.com", [[govPool.address, 0, bytesEditUrl]], []);

            await govPool.vote(1, wei("1000"), [], true);
            await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false, true);
            await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

            await govPool.execute(1);

            assert.equal(await govPool.descriptionURL(), newUrl);
          });

          it("should revert when call is from non govPool address", async () => {
            await truffleAssert.reverts(govPool.editDescriptionURL("new_url"), "Gov: not this contract");
          });
        });

        describe("setNftMultiplierAddress()", () => {
          it.skip("should create proposal for setNftMultiplierAddress", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);
            assert.equal((await govPool.getNftContracts()).nftMultiplier, nftMultiplier.address);
          });

          it.skip("should set zero address", async () => {
            await setNftMultiplierAddress(nftMultiplier.address);

            await setNftMultiplierAddress(ZERO_ADDR);

            assert.equal((await govPool.getNftContracts()).nftMultiplier, ZERO_ADDR);
          });

          it.skip("should change nftMultiplier to newer", async () => {
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
          it.skip("should mint an expert NFT and change coefficients", async () => {
            assert.isFalse(await expertNft.isExpert(SECOND));
            assert.equal(
              (await govPool.getVoteModifierForUser(SECOND)).toFixed(),
              (await govPool.getVoteModifiers())[0].toFixed()
            );

            await changeVoteModifiers(wei("1.01", 25), wei("1.02", 25));

            await setExpert(SECOND);

            assert.isTrue(await expertNft.isExpert(SECOND));

            const modifiers = await govPool.getVoteModifiers();

            assert.equal((await govPool.getVoteModifierForUser(SECOND)).toFixed(), wei("1.02", 25));
            assert.equal(modifiers["0"].toFixed(), wei("1.01", 25));
            assert.equal(modifiers["1"].toFixed(), wei("1.02", 25));
          });

          it("should be an expert if dexe nft is minted", async () => {
            assert.isFalse(await govPool.getExpertStatus(SECOND));

            await dexeExpertNft.mint(SECOND, "");

            assert.isTrue(await govPool.getExpertStatus(SECOND));
          });

          it("should revert if call is not from gov pool", async () => {
            await truffleAssert.reverts(govPool.changeVoteModifiers(1, 1), "Gov: not this contract");
          });

          it.skip("should revert if user is provided modifiers less than 1", async () => {
            await truffleAssert.reverts(
              changeVoteModifiers(wei("1", 25), wei("0.99", 25)),
              "Gov: vote modifiers are less than 1"
            );
            await truffleAssert.reverts(
              changeVoteModifiers(wei("0.99", 25), wei("1", 25)),
              "Gov: vote modifiers are less than 1"
            );
          });
        });

        describe.skip("delegateTreasury() undelegateTreasury() voteTreasury()", () => {
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

            await delegateTreasury(THIRD, wei("100"), ["10", "11"]);

            assert.equal((await token.balanceOf(THIRD)).toFixed(), "0");
            assert.equal((await nft.balanceOf(THIRD)).toFixed(), "0");

            assert.equal(
              (await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).totalBalance.toFixed(),
              wei("100")
            );
            assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");

            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
              ["10", "11"]
            );
            assert.deepEqual(
              (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).ownedLength.toFixed(),
              "0"
            );

            const govPoolBalance = await token.balanceOf(govPool.address);
            await govPool.createProposal(
              "example.com",

              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, wei(50), ["10"])]],
              []
            );
            let proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, wei("1000"), [], true);
            await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal((await token.balanceOf(govPool.address)).toFixed(), govPoolBalance.plus(wei("50")).toFixed());
            assert.equal(await nft.ownerOf("10"), govPool.address);
            assert.equal(await nft.ownerOf("11"), userKeeper.address);

            await govPool.createProposal(
              "example.com",

              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, wei(50), [])]],
              []
            );
            proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, wei("1000"), [], true);
            await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal((await token.balanceOf(govPool.address)).toFixed(), govPoolBalance.plus(wei("100")).toFixed());
            await govPool.createProposal(
              "example.com",

              [[govPool.address, 0, getBytesUndelegateTreasury(THIRD, "0", ["11"])]],
              []
            );
            proposalId = await govPool.latestProposalId();
            await govPool.vote(proposalId, wei("1000"), [], true);
            await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });
            await govPool.moveProposalToValidators(proposalId);
            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
            await govPool.execute(proposalId);

            assert.equal(await nft.ownerOf("11"), govPool.address);

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

          it("should NOT give the rewards for delegated ERC20 + ERC721", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10", "11"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(3, wei("50"), ["10", "11"], true, { from: THIRD });
            await govPool.voteTreasury(3, wei("50"), [], false, { from: THIRD });
            await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("100"), false, true);
            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await govPool.execute(3);

            const expectedReward = (
              await weiToVotes(
                (await userKeeper.getNftsPowerInTokensBySnapshot(["10", "11"], 3)).plus(wei("50")),
                THIRD
              )
            )
              .times(809 / 50000)
              .decimalPlaces(0);

            assert.equal((await govPool.getPendingRewards(THIRD, [3]))[0][0], expectedReward.toFixed());

            await govPool.claimRewards([3], { from: THIRD });

            assert.equal(await rewardToken.balanceOf(THIRD), expectedReward.toFixed());

            const treasuryBalance = await rewardToken.balanceOf(govPool.address);

            await truffleAssert.reverts(
              undelegateTreasury(THIRD, wei("101"), ["10", "11"]),
              "GovUK: can't withdraw this"
            );
            assert.equal((await rewardToken.balanceOf(govPool.address)).toFixed(), treasuryBalance.toFixed());
          });

          it("should NOT claim delegate reward properly if nft multiplier has been set", async () => {
            const bytesSetAddress = getBytesSetNftMultiplierAddress(nftMultiplier.address);
            await govPool.createProposal("example.com", [[govPool.address, 0, bytesSetAddress]], []);
            await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });
            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });
            await govPool.execute(1);

            await nftMultiplier.mint(THIRD, PRECISION.times("2.5"), 10000000000);
            await nftMultiplier.lock(1, { from: THIRD });

            await delegateTreasury(THIRD, wei("100"), ["10", "11"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(4, wei("100"), ["10", "11"], true, { from: THIRD });
            await govPool.vote(4, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(4);

            await validators.vote(4, wei("100"), false, true);
            await validators.vote(4, wei("1000000000000"), false, true, { from: SECOND });

            await govPool.execute(4);

            const expectedReward = (
              await weiToVotes(
                (await userKeeper.getNftsPowerInTokensBySnapshot(["10", "11"], 4)).plus(wei("100")),
                THIRD
              )
            )
              .times(809 / 50000)
              .decimalPlaces(0);

            assert.equal((await govPool.getPendingRewards(THIRD, [4]))[0][0], expectedReward.toFixed());

            await govPool.claimRewards([4], { from: THIRD });

            assert.equal((await rewardToken.balanceOf(THIRD)).toFixed(), expectedReward.toFixed());
          });

          it("should work properly with multiple delegateTreasury", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10", "11"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.voteTreasury(3, 0, ["11"], true, { from: THIRD });

            await truffleAssert.reverts(
              govPool.voteTreasury(3, wei("100"), [], true, { from: THIRD }),
              "Gov: wrong vote amount"
            );

            await delegateTreasury(THIRD, wei("100"), []);
            await delegateTreasury(THIRD, 0, ["12"]);

            await govPool.voteTreasury(3, wei("100"), ["12"], true, { from: THIRD });
          });

          it("should calculate reward properly regarding to treasuryVoteCoefficient and resulting coefficient < 1", async () => {
            await delegateTreasury(THIRD, wei("10000000000000000000"), []);
            await delegateTreasury(FOURTH, wei("100"), []);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(5, wei("10000000000000000000"), [], true, { from: THIRD });
            await govPool.voteTreasury(5, wei("50"), [], true, { from: FOURTH });
            await govPool.vote(5, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(5);

            await validators.vote(5, wei("100"), false, true);
            await validators.vote(5, wei("1000000000000"), false, true, { from: SECOND });

            await govPool.execute(5);

            const expectedReward = (await weiToVotes(wei("10000000000000000000"), THIRD))
              .times(809 / 50000)
              .decimalPlaces(0);

            assert.equal((await govPool.getPendingRewards(THIRD, [5]))[0][0], expectedReward.toFixed());
          });

          it("should calculate reward properly regarding to treasuryVoteCoefficient and resulting coefficient > 1", async () => {
            await delegateTreasury(THIRD, wei("50"), []);
            await delegateTreasury(FOURTH, wei("100"), []);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await changeVoteModifiers(wei("1", 25), wei("1.01", 25));

            await govPool.voteTreasury(5, wei("50"), [], true, { from: THIRD });
            await govPool.voteTreasury(5, wei("50"), [], true, { from: FOURTH });
            await govPool.vote(5, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(5);

            await validators.vote(5, wei("100"), false, true);
            await validators.vote(5, wei("1000000000000"), false, true, { from: SECOND });

            await govPool.execute(5);

            const expectedReward = (await weiToVotes(wei("50"), THIRD, true)).times(809 / 50000).decimalPlaces(0);

            assert.equal((await govPool.getPendingRewards(THIRD, [5]))[0][0], expectedReward.toFixed());
          });

          it("should clean userProposals correctly when ExecutedFor", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.vote(3, wei("1000"), [], true);
            await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("100"), false, true);
            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.execute(3);

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.unlock(THIRD, VoteType.TreasuryVote);
          });

          it("should clean userProposals correctly when ExecutedAgainst", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            await govPool.createProposal(
              "example.com",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
            );

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.vote(3, wei("1000"), [], false);
            await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("100"), false, true);
            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await token.mint(SECOND, wei("10"));
            await token.approve(userKeeper2.address, wei("10"), { from: SECOND });
            await govPool2.deposit(govPool.address, wei("10"), [], { from: SECOND });
            await dexeExpertNft.mint(OWNER, "");
            await govPool2.createProposal(
              "example.com",

              [[settings2.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
              []
            );

            await govPool.execute(3);

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.unlock(THIRD, VoteType.TreasuryVote);
          });

          it("should clean userProposals correctly when Defeated", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.vote(3, wei("1000"), [], false);
            await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.unlock(THIRD, VoteType.TreasuryVote);
          });

          it("should clean userProposals correctly when SucceededFor", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.vote(3, wei("1000"), [], true);
            await govPool.vote(3, wei("100000000000000000000"), [], true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.unlock(THIRD, VoteType.TreasuryVote);
          });

          it("should clean userProposals correctly when SucceededAgainst", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            await govPool.createProposal(
              "example.com",

              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
              [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
            );

            await govPool.voteTreasury(3, wei("100"), ["10"], true, { from: THIRD });

            await govPool.vote(3, wei("1000"), [], false);
            await govPool.vote(3, wei("100000000000000000000"), [], false, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.unlock(THIRD, VoteType.TreasuryVote);
          });

          it("should revert when vote is zero amount", async () => {
            await truffleAssert.reverts(govPool.voteTreasury(1, 0, [], true), "Gov: empty delegated vote");
          });

          it("should not delegate zero tokens", async () => {
            await truffleAssert.reverts(delegateTreasury(THIRD, 0, []), "Gov: empty delegation");
          });

          it("should revert voting when delegatedVotingAllowed", async () => {
            await delegateTreasury(THIRD, wei("100"), ["10"]);

            const NEW_SETTINGS = {
              earlyCompletion: true,
              delegatedVotingAllowed: true,
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
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "new_settings",
            };
            await govPool.createProposal(
              "example.com",

              [[settings.address, 0, getBytesEditSettings([1], [NEW_SETTINGS])]],
              []
            );
            await token.mint(SECOND, wei("200000000000000000000"));
            await token.approve(userKeeper.address, wei("200000000000000000000"), { from: SECOND });

            await depositAndVote(3, wei("200000000000000000000"), [], wei("200000000000000000000"), [], SECOND);

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.moveProposalToValidators(3);

            await validators.vote(3, wei("1000000000000"), false, true, { from: SECOND });

            await setTime((await getCurrentBlockTime()) + 10000);

            await govPool.execute(3);

            await govPool.createProposal(
              "example.com",

              [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
              []
            );

            await truffleAssert.reverts(
              govPool.voteTreasury(4, wei("100"), ["10"], true, { from: THIRD }),
              "Gov: treasury voting is off"
            );
          });

          it("should revert if call is not from expert", async () => {
            await token.mint(govPool.address, wei("1"));

            const bytesDelegateTreasury = getBytesDelegateTreasury(THIRD, wei("1"), []);

            await govPool.createProposal("example.com", [[govPool.address, 0, bytesDelegateTreasury]], []);

            const proposalId = await govPool.latestProposalId();

            await govPool.vote(proposalId, wei("1000"), [], true);
            await govPool.vote(proposalId, wei("100000000000000000000"), [], true, { from: SECOND });

            await govPool.moveProposalToValidators(proposalId);

            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
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

            await govPool.vote(1, wei("1000"), [], true);
            await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false, true);
            await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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

            await govPool.vote(1, wei("1000"), [], true);
            await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

            await govPool.moveProposalToValidators(1);
            await validators.vote(1, wei("100"), false, true);
            await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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
                voteForRewardsCoefficient: 0,
                voteAgainstRewardsCoefficient: 0,
              },
              executorDescription: "new_internal_settings",
            };

            let VICTIM;
            let DELEGATOR;

            beforeEach(async () => {
              const addSettingsBytes = getBytesAddSettings([USER_KEERER_SETTINGS]);

              await govPool.createProposal("example.com", [[settings.address, 0, addSettingsBytes]], []);
              await govPool.vote(1, wei("1000"), [], true);
              await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

              await govPool.moveProposalToValidators(1);

              await validators.vote(1, wei("100"), false, true);
              await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

              await govPool.execute(1);

              const changeExecutorBytes = getBytesChangeExecutors([userKeeper.address], [4]);

              await govPool.createProposal("example.com", [[settings.address, 0, changeExecutorBytes]], []);
              await govPool.vote(2, wei("1000"), [], true);
              await govPool.vote(2, wei("100000000000000000000"), [], true, { from: SECOND });

              await govPool.moveProposalToValidators(2);

              await validators.vote(2, wei("100"), false, true);
              await validators.vote(2, wei("1000000000000"), false, true, { from: SECOND });

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

            it("should not withdraw victim's tokens in the same block if vote delegated", async () => {
              const bytes = getBytesKeeperWithdrawTokens(VICTIM, SECOND, wei("111222"));

              await govPool.createProposal("example.com", [[userKeeper.address, 0, bytes]], [], {
                from: SECOND,
              });

              await truffleAssert.reverts(
                govPool.multicall(
                  [getBytesGovVoteDelegated(3, wei("100000000000000000000"), []), getBytesGovExecute(3)],
                  {
                    from: SECOND,
                  }
                ),
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

      describe.skip("after adding internal proposals", async () => {
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
            voteForRewardsCoefficient: 0,
            voteAgainstRewardsCoefficient: 0,
          },
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

          await govPool.deposit(OWNER, wei("1000"), []);

          for (const proposalView of proposalViews) {
            const { descriptionURL, actionsOnFor, actionsOnAgainst } = proposalView.proposal;
            await govPool.createProposal(descriptionURL, actionsOnFor, actionsOnAgainst);
          }

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.vote(3, wei("1000"), [], true);
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

    describe.skip("reward", () => {
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
          voteForRewardsCoefficient: PRECISION.toFixed(),
          voteAgainstRewardsCoefficient: PRECISION.toFixed(),
        },
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

      it("should claim reward on For", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        let rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainRewards, ["0"]);
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        await govPool.execute(1);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          (await tokensToVotes("100000000000000000000"))
            .plus(await tokensToVotes("1000"))
            .plus(wei(25))
            .idiv(5)
            .toFixed()
        );

        rewards = await govPool.getPendingRewards(OWNER, [1]);

        let ownerReward = (await tokensToVotes(1000)).plus(wei(25));
        assert.equal(rewards.onchainRewards[0], ownerReward.toFixed());

        await govPool.claimRewards([1]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), ownerReward.toFixed());
      });

      it("should claim reward on Against", async () => {
        await govPool.createProposal(
          "example.com",

          [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], true)]],
          [[govPool2.address, 0, getBytesGovVote(1, wei("1"), [], false)]]
        );
        await govPool.vote(1, wei("1000"), [], false);
        await govPool.vote(1, wei("100000000000000000000"), [], false, { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 10000);

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        let rewards = await govPool.getPendingRewards(OWNER, [1]);

        assert.deepEqual(rewards.onchainRewards, ["0"]);
        assert.deepEqual(rewards.offchainTokens, []);
        assert.deepEqual(rewards.offchainRewards, []);

        await token.mint(SECOND, wei("10"));
        await token.approve(userKeeper2.address, wei("10"), { from: SECOND });
        await govPool2.deposit(govPool.address, wei("10"), [], { from: SECOND });
        await dexeExpertNft.mint(OWNER, "");
        await govPool2.createProposal(
          "example.com",

          [[settings2.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );

        await govPool.execute(1);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          (await tokensToVotes("100000000000000000000"))
            .plus(await tokensToVotes("1000"))
            .plus(wei(25))
            .idiv(5)
            .toFixed()
        );

        rewards = await govPool.getPendingRewards(OWNER, [1]);

        let ownerReward = (await tokensToVotes(1000)).plus(wei(25));
        assert.equal(rewards.onchainRewards[0], ownerReward.toFixed());

        await govPool.claimRewards([1]);

        assert.equal((await rewardToken.balanceOf(OWNER)).toFixed(), ownerReward.toFixed());
      });

      it("should claim reward properly if nft multiplier has been set", async () => {
        await setNftMultiplierAddress(nftMultiplier.address);

        await nftMultiplier.mint(OWNER, PRECISION.times("2.5"), 1000);
        await nftMultiplier.lock(1);

        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(2, wei("1000"), [], true);
        await govPool.vote(2, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(2);
        await validators.vote(2, wei("100"), false, true);
        await validators.vote(2, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(2);
        await govPool.claimRewards([2]);

        assert.equal(
          (await rewardToken.balanceOf(OWNER)).toFixed(),
          (await tokensToVotes(1000)).plus(wei(25)).times(3.5).toFixed()
        ); // f(1025) + f(1025) * 2.5
      });

      it("should execute and claim", async () => {
        const bytes = getBytesAddSettings([NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), "0");

        await executeAndClaim(1, OWNER);

        assert.equal(
          (await rewardToken.balanceOf(treasury)).toFixed(),
          (await tokensToVotes("100000000000000000000"))
            .plus(await tokensToVotes("1000"))
            .plus(wei(25))
            .idiv(5)
            .toFixed()
        );
        assert.equal(
          (await rewardToken.balanceOf(OWNER)).toFixed(),
          (await tokensToVotes(1000)).plus(wei(25)).toFixed()
        );
      });

      it("should claim reward in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await network.provider.send("hardhat_setBalance", [govPool.address, "0x" + wei("100")]);

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, wei("1"), [], true);

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

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));

        await govPool.execute(1);

        assert.equal((await rewardToken.balanceOf(treasury)).toFixed(), wei("10000000000000000000000"));
      });

      it("should not claim rewards in native", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("1000"), [], true);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("100"), false, true);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          [],
          {
            from: coreProperties.address,
          }
        );

        await govPool.vote(2, wei("100000000000000000000"), [], true, { from: coreProperties.address });

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
          executionDelay: 0,
          rewardsInfo: {
            rewardToken: ZERO_ADDR,
            creationReward: wei("10"),
            executionReward: wei("5"),
            voteForRewardsCoefficient: PRECISION.toFixed(),
            voteAgainstRewardsCoefficient: PRECISION.toFixed(),
          },
          executorDescription: "new_settings",
        };

        const bytes = getBytesEditSettings([1], [NO_REWARDS_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, wei("1"), [], true);

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "Gov: rewards are off");
      });

      it("should revert when try claim reward before execute", async () => {
        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await truffleAssert.reverts(govPool.claimRewards([1]), "Gov: proposal is not executed");
      });

      it("should mint when balance < rewards", async () => {
        let newToken = await ERC20Mock.new("NT", "NT", 18);

        NEW_SETTINGS.rewardsInfo.rewardToken = newToken.address;

        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, wei("1"), [], true);

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), "0");
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("0"));

        await executeAndClaim(2, OWNER);

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), wei("0"));
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("16"));
      });

      it("should not revert when mint failed, but during transfer", async () => {
        let newToken = await ERC20.new("NT", "NT");

        NEW_SETTINGS.rewardsInfo.rewardToken = newToken.address;

        const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

        await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);
        await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

        await govPool.moveProposalToValidators(1);
        await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

        await govPool.execute(1);

        await govPool.createProposal(
          "example.com",

          [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
          []
        );
        await govPool.vote(2, wei("1"), [], true);

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), "0");
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("0"));

        await govPool.execute(2);

        await truffleAssert.reverts(govPool.claimRewards([2]), "ERC20: transfer amount exceeds balance");

        assert.equal((await newToken.balanceOf(treasury)).toFixed(), "0");
        assert.equal((await newToken.balanceOf(OWNER)).toFixed(), wei("0"));
      });
    });

    describe("staking", () => {
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
          voteForRewardsCoefficient: PRECISION.toFixed(),
          voteAgainstRewardsCoefficient: PRECISION.toFixed(),
        },
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

      describe.skip("delegate() undelegate() voteDelegated()", () => {
        it("should give the proportional rewards for delegated ERC20 + ERC721", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("100000000000000000000"), [10, 11, 12, 13], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [20, 21, 22, 23], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [30, 31], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], true, { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("100"), false, true);
          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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

        it("should claim delegate reward properly if nft multiplier has been set", async () => {
          await token.mint(SECOND, wei("25000000000000000000000000"));
          await token.approve(userKeeper.address, wei("25000000000000000000000000"), { from: SECOND });
          await govPool.deposit(SECOND, wei("25000000000000000000000000"), [], { from: SECOND });

          const bytesSetAddress = getBytesSetNftMultiplierAddress(nftMultiplier.address);
          await govPool.createProposal("example.com", [[govPool.address, 0, bytesSetAddress]], []);
          await govPool.vote(1, wei("25000000000000000000000000"), [], true, { from: SECOND });
          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);
          await nftMultiplier.mint(micropool, PRECISION.times("2.5"), 10000000000);
          await nftMultiplier.lock(1, { from: micropool });

          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await token.mint(delegator1, wei("1000000000000000000000000000"));
          await token.approve(userKeeper.address, wei("1000000000000000000000000000"), { from: delegator1 });
          await govPool.deposit(delegator1, wei("1000000000000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1000000000000000000000000000"), [10, 11, 12, 13], {
            from: delegator1,
          });

          await govPool.voteDelegated(2, wei("1000000000000000000000000000"), [], true, { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(2);

          await validators.vote(2, wei("100"), false, true);
          await validators.vote(2, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(2);

          await govPool.claimRewards([2], { from: micropool });

          assert.equal((await rewardToken.balanceOf(micropool)).toFixed(), wei("200000000000000000000000000")); // 1000000000000000000000000000 * 0.2
        });

        it("should claim delegate reward properly if nft multiplier and vote modifier have been set", async () => {
          await token.mint(SECOND, wei("25000000000000000000000000"));
          await token.approve(userKeeper.address, wei("25000000000000000000000000"), { from: SECOND });
          await govPool.deposit(SECOND, wei("25000000000000000000000000"), [], { from: SECOND });

          const bytesSetAddress = getBytesSetNftMultiplierAddress(nftMultiplier.address);
          await govPool.createProposal("example.com", [[govPool.address, 0, bytesSetAddress]], []);
          await govPool.vote(1, wei("25000000000000000000000000"), [], true, { from: SECOND });
          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);
          await nftMultiplier.mint(micropool, PRECISION.times("2.5"), 10000000000);
          await nftMultiplier.lock(1, { from: micropool });

          await setExpert(THIRD, async (proposalId) => {
            await govPool.vote(proposalId, wei("25000000000000000000000000"), [], true, { from: SECOND });
            await setTime((await getCurrentBlockTime()) + 10000);
            await govPool.moveProposalToValidators(proposalId);
            await validators.vote(proposalId, wei("100"), false, true);
            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
            await setTime((await getCurrentBlockTime()) + 10000);
          });

          await changeVoteModifiers(wei("1.01", 25), wei("1.02", 25));

          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await token.mint(delegator1, wei("1000000000000000000000000000"));
          await token.approve(userKeeper.address, wei("1000000000000000000000000000"), { from: delegator1 });
          await govPool.deposit(delegator1, wei("1000000000000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1000000000000000000000000000"), [10, 11, 12, 13], {
            from: delegator1,
          });
          await govPool.voteDelegated(4, wei("1000000000000000000000000000"), [], true, { from: micropool });
          await token.mint(THIRD, wei("25000000000000000000000000"));
          await token.approve(userKeeper.address, wei("25000000000000000000000000"), { from: THIRD });
          await govPool.deposit(THIRD, wei("25000000000000000000000000"), [], { from: THIRD });
          await govPool.vote(4, wei("25000000000000000000000000"), [], true, { from: THIRD });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(4);

          await validators.vote(4, wei("100"), false, true);
          await validators.vote(4, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(4);

          await govPool.claimRewards([4], { from: micropool });

          assert.equal(
            (await rewardToken.balanceOf(micropool)).toFixed(),
            (await weiToVotes(wei("1000000000000000000000000000"), micropool)).times(0.2).toFixed()
          ); // f(1000000000000000000000000000) * 0.2
        });

        it("should give the proper rewards with multiple async delegates", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("1000"), [10, 11, 12, 13], { from: delegator1 });
          await govPool.voteDelegated(1, wei("800"), [], true, { from: micropool });

          await govPool.delegate(micropool, wei("1000"), [20, 21, 22, 23], { from: delegator2 });
          await govPool.voteDelegated(1, wei("800"), [], true, { from: micropool });

          await govPool.delegate(micropool, wei("500"), [30, 31], { from: delegator3 });
          await govPool.voteDelegated(1, wei("800"), [], true, { from: micropool });

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
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("250"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1250"), [], { from: delegator2 });

          await govPool.voteDelegated(1, wei("2000"), [], true, { from: micropool });

          await govPool.delegate(micropool, wei("2500"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator2 });

          await govPool.voteDelegated(1, wei("3000"), [], true, { from: micropool });

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

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);

          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], true, { from: micropool });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );

          await govPool.voteDelegated(2, wei("250000000000000000000"), [], true, { from: micropool });

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

          NEW_SETTINGS.rewardsInfo.rewardToken = newRewardToken.address;

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);

          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("250000000000000000000"), [], true, { from: micropool });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );

          await govPool.voteDelegated(2, wei("250000000000000000000"), [], true, { from: micropool });

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

      describe.skip("request()", () => {
        it("should block tokens for future usage", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("1000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator3 });

          await govPool.request(micropool, wei("500"), [], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.voteDelegated(1, wei("2001"), [], true, { from: micropool }),
            "Gov: wrong vote amount"
          );

          assert.ok(await govPool.voteDelegated(1, wei("2000"), [], true, { from: micropool }));
        });

        it("should block nfts for future usage", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, "0", [10, 11, 12, 13], { from: delegator1 });
          await govPool.delegate(micropool, "0", [20, 21, 22, 23], { from: delegator2 });
          await govPool.delegate(micropool, "0", [30, 31], { from: delegator3 });

          await govPool.request(micropool, "0", [10, 11, 12, 13], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.voteDelegated(1, "0", [10, 20], true, { from: micropool }),
            "GovUK: NFT is not owned or requested"
          );

          assert.ok(await govPool.voteDelegated(1, "0", [20, 21, 22, 23, 30, 31], true, { from: micropool }));
        });

        it("should not give rewards for blocked tokens", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("50000000000000000000"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("100000000000000000000"), [], true, { from: micropool });

          await govPool.request(micropool, wei("10000000000000000000"), [], { from: delegator1 });

          await govPool.voteDelegated(1, wei("140000000000000000000"), [], true, { from: micropool });

          await setTime((await getCurrentBlockTime()) + 10000);

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("100"), false, true);
          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);
          await govPool.claimRewards([1], { from: micropool });

          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("100000000000000000000"), [], { from: delegator2 });

          const balance1 = await rewardToken.balanceOf(delegator1);
          const balance2 = await rewardToken.balanceOf(delegator2);

          assert.notEqual(balance1.toFixed(), balance2.toFixed());
        });

        it("should not undelegate requested but unavailable tokens", async () => {
          await govPool.createProposal("examplenft.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, wei("1000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator3 });

          await govPool.voteDelegated(1, wei("2500"), [], true, { from: micropool });

          await govPool.request(micropool, wei("500"), [], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.undelegate(micropool, wei("1"), [], { from: delegator1 }),
            "GovUK: amount exceeds delegation"
          );
        });

        it("should not undelegate requested but unavailable nfts", async () => {
          await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);

          await govPool.delegate(micropool, "0", [10, 11, 12, 13], { from: delegator1 });
          await govPool.delegate(micropool, "0", [20, 21, 22, 23], { from: delegator2 });
          await govPool.delegate(micropool, "0", [30, 31], { from: delegator3 });

          await govPool.voteDelegated(1, "0", [10, 11, 12, 13, 20, 21, 22, 23, 30, 31], true, { from: micropool });

          await govPool.request(micropool, "0", [10, 11, 12, 13], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.undelegate(micropool, "0", [10, 11, 12, 13], { from: delegator1 }),
            "GovUK: NFT is not owned or locked"
          );
        });

        it("should revert if requested amount is greater than the delegated", async () => {
          await govPool.delegate(micropool, wei("1000"), [], { from: delegator1 });
          await govPool.delegate(micropool, wei("1000"), [], { from: delegator2 });
          await govPool.delegate(micropool, wei("500"), [], { from: delegator3 });

          await truffleAssert.reverts(
            govPool.request(micropool, wei("1001"), [], { from: delegator1 }),
            "GovUK: overrequest"
          );

          await truffleAssert.reverts(
            govPool.request(micropool, wei("501"), [], { from: delegator3 }),
            "GovUK: overrequest"
          );

          await govPool.request(micropool, wei("1000"), [], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.request(micropool, wei("1"), [], { from: delegator1 }),
            "GovUK: overrequest"
          );
        });

        it("should not revert if requested nftIds have already be requested", async () => {
          await govPool.delegate(micropool, "0", [10, 11, 12, 13], { from: delegator1 });

          await truffleAssert.reverts(
            govPool.request(micropool, "0", [10, 11, 12, 13, 20, 21, 22, 23], { from: delegator1 }),
            "GovUK: NFT is not owned"
          );

          assert.ok(await govPool.request(micropool, "0", [10], { from: delegator1 }));

          assert.ok(await govPool.request(micropool, "0", [10, 11, 12, 13], { from: delegator1 }));
        });

        it("should revert if delegatee is zero", async () => {
          await truffleAssert.reverts(
            govPool.request(ZERO_ADDR, wei("100000000000000000000"), [], { from: delegator1 }),
            "GovUK: overrequest"
          );

          await truffleAssert.reverts(
            govPool.request(ZERO_ADDR, "0", [10, 11, 12, 13], { from: delegator1 }),
            "GovUK: NFT is not owned"
          );
        });

        it("should revert if amount and nftIds length are zero", async () => {
          await truffleAssert.reverts(govPool.request(micropool, 0, [], { from: delegator1 }), "Gov: empty request");
        });
      });

      describe.skip("getDelegatorStakingRewards()", () => {
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

          NEW_SETTINGS.rewardsInfo.rewardToken = newRewardToken.address;
          NEW_SETTINGS.earlyCompletion = false;
          NEW_SETTINGS.duration = 2;
          NEW_SETTINGS.delegatedVotingAllowed = false;
          NEW_SETTINGS.rewardsInfo.creationReward = 0;
          NEW_SETTINGS.rewardsInfo.executionReward = 0;

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);

          await govPool.voteDelegated(1, wei("125000000000000000000"), [], true, { from: micropool });
          await govPool.voteDelegated(1, wei("125000000000000000000"), [], true, { from: micropool2 });

          await govPool.moveProposalToValidators(1);

          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(1);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );
          await govPool.voteDelegated(2, wei("125000000000000000000"), [], true, { from: micropool });
          await govPool.voteDelegated(2, wei("125000000000000000000"), [], true, { from: micropool2 });

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

        it("should return delegator staking rewards properly when vote modifier applied", async () => {
          await changeVoteModifiers(wei("1.001", 25), wei("1", 25), async (proposalId) => {
            await token.mint(OWNER, wei("100000000000000000000000"));
            await token.approve(userKeeper.address, wei("100000000000000000000000"), { from: OWNER });
            await govPool.deposit(OWNER, wei("100000000000000000000000"), [], { from: OWNER });
            await govPool.vote(proposalId, wei("100000000000000000000000"), [], true, { from: OWNER });
            await govPool.moveProposalToValidators(proposalId);
            await validators.vote(proposalId, wei("1000000000000"), false, true, { from: SECOND });
          });

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

          NEW_SETTINGS.rewardsInfo.rewardToken = newRewardToken.address;
          NEW_SETTINGS.earlyCompletion = false;
          NEW_SETTINGS.duration = 2;
          NEW_SETTINGS.delegatedVotingAllowed = false;
          NEW_SETTINGS.rewardsInfo.creationReward = 0;
          NEW_SETTINGS.rewardsInfo.executionReward = 0;

          const bytes = getBytesEditSettings([1], [NEW_SETTINGS]);

          await govPool.createProposal("example.com", [[settings.address, 0, bytes]], []);

          await govPool.voteDelegated(2, wei("125000000000000000000"), [], true, { from: micropool });
          await govPool.voteDelegated(2, wei("125000000000000000000"), [], true, { from: micropool2 });
          await govPool.vote(2, wei("100000000000000000000000"), [], true, { from: OWNER });

          await govPool.moveProposalToValidators(2);

          await validators.vote(2, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(2);

          await govPool.createProposal(
            "example.com",

            [[settings.address, 0, getBytesAddSettings([NEW_SETTINGS])]],
            []
          );
          await govPool.voteDelegated(3, wei("125000000000000000000"), [], true, { from: micropool });
          await govPool.voteDelegated(3, wei("125000000000000000000"), [], true, { from: micropool2 });

          await govPool.execute(3);

          let rewards1 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator1));
          let rewards2 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator2));
          let rewards3 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator3));

          const expectedRewardPart = toBN("20947244682111850187763362500000000000");
          const realRewardPart = toBN("27631888294720374530591588300581479024");

          assert.deepEqual(rewards1, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.times(2).toFixed(), expectedRewardPart.times(2).toFixed()],
              realRewards: ["0", realRewardPart.toFixed()],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.times(2).toFixed(), expectedRewardPart.times(2).toFixed()],
              realRewards: ["0", realRewardPart.toFixed()],
            },
          ]);
          assert.deepEqual(rewards2, rewards1);
          assert.deepEqual(rewards3, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
              realRewards: ["0", expectedRewardPart.toFixed()],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
              realRewards: ["0", expectedRewardPart.toFixed()],
            },
          ]);

          await rewardToken.mint(govPool.address, wei("100000000000000000000000"));

          rewards1 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator1));
          rewards2 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator2));
          rewards3 = userStakeRewardsArrayToObject(await govPool.getDelegatorStakingRewards(delegator3));

          assert.deepEqual(rewards1, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.times(2).toFixed(), expectedRewardPart.times(2).toFixed()],
              realRewards: [expectedRewardPart.times(2).toFixed(), realRewardPart.toFixed()],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.times(2).toFixed(), expectedRewardPart.times(2).toFixed()],
              realRewards: [expectedRewardPart.times(2).toFixed(), realRewardPart.toFixed()],
            },
          ]);
          assert.deepEqual(rewards2, rewards1);
          assert.deepEqual(rewards3, [
            {
              micropool: micropool,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
              realRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
            },
            {
              micropool: micropool2,
              rewardTokens: [rewardToken.address, newRewardToken.address],
              expectedRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
              realRewards: [expectedRewardPart.toFixed(), expectedRewardPart.toFixed()],
            },
          ]);

          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool, wei("25000000000000000000"), [], { from: delegator3 });

          await govPool.undelegate(micropool2, wei("50000000000000000000"), [], { from: delegator1 });
          await govPool.undelegate(micropool2, wei("50000000000000000000"), [], { from: delegator2 });
          await govPool.undelegate(micropool2, wei("25000000000000000000"), [], { from: delegator3 });
        });
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

      describe.skip("correct proposal workflow", () => {
        let startTime;
        let CREDIT_TOKEN;

        beforeEach("setup", async () => {
          CREDIT_TOKEN = await ERC20Mock.new("Mock", "Mock", 18);
          await CREDIT_TOKEN.mint(govPool.address, wei("1000"));

          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(OWNER, wei("1000"), []);
          await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });

          await govPool.createProposal(
            "example.com",

            [[govPool.address, 0, getBytesSetCreditInfo([CREDIT_TOKEN.address], [wei("1000")])]],
            []
          );

          startTime = await getCurrentBlockTime();

          await govPool.vote(1, wei("100000000000000000000"), [], true, { from: SECOND });

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false, true);
          await validators.vote(1, wei("1000000000000"), false, true, { from: SECOND });

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
          await validators.vote(proposalId, wei("100"), true, true);
          await validators.vote(proposalId, wei("1000000000000"), true, true, { from: SECOND });

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), "0");
          await validators.execute(proposalId);
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
          await validators.vote(proposalId, wei("100"), true, true);
          await validators.vote(proposalId, wei("1000000000000"), true, true, { from: SECOND });

          await govPool.createProposal(
            "example.com",

            [[govPool.address, 0, getBytesSetCreditInfo([CREDIT_TOKEN.address], [0])]],
            []
          );

          await govPool.vote(2, wei("100000000000000000000"), [], true, { from: SECOND });

          await govPool.moveProposalToValidators(2);
          await validators.vote(2, wei("100"), false, true);
          await validators.vote(2, wei("1000000000000"), false, true, { from: SECOND });

          await govPool.execute(2);

          await truffleAssert.reverts(validators.execute(proposalId), "Validators: failed to execute");
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

          await validators.vote(1, wei("1000000000000"), true, true, { from: SECOND });

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

          await setTime((await getCurrentBlockTime()) + 1);

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);

          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), "0");
          await validators.execute(1);
          assert.equal((await CREDIT_TOKEN.balanceOf(SECOND)).toFixed(), wei("777"));
          assert.deepEqual(await govPool.getCreditInfo(), [[CREDIT_TOKEN.address, wei("1000"), wei("223")]]);

          assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Executed);
        });
      });
    });
  });

  describe("ERC721Power", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = await getPoolParameters(nftPower.address);

      const poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;

      await setupTokens();
    });

    describe.skip("staking", () => {
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
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []);
      });

      it("should not give rewards for zero power nfts staking", async () => {
        await govPool.delegate(micropool, 0, [10, 11, 12], { from: delegator1 });
        await govPool.delegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await govPool.voteDelegated(1, 0, [10, 11, 12, 20, 21, 22], true, { from: micropool });

        await setTime((await getCurrentBlockTime()) + 10000);

        await govPool.undelegate(micropool, 0, [10, 11, 12], { from: delegator1 });
        await govPool.undelegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        const balance1 = await rewardToken.balanceOf(delegator1);
        const balance2 = await rewardToken.balanceOf(delegator2);

        assert.equal(balance1.toFixed(), "0");
        assert.equal(balance2.toFixed(), "0");
      });

      it("should properly divide rewards by deviation", async () => {
        await setTime((await getCurrentBlockTime()) + 200);

        await govPool.delegate(micropool, 0, [10, 11, 12], { from: delegator1 });
        await govPool.delegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await govPool.voteDelegated(1, 0, [10, 11, 12, 20, 21, 22], true, { from: micropool });

        await setTime((await getCurrentBlockTime()) + 1000);
        await govPool.undelegate(micropool, 0, [20, 21, 22], { from: delegator2 });

        await setTime((await getCurrentBlockTime()) + 4465);
        await govPool.undelegate(micropool, 0, [10, 11, 12], { from: delegator1 });

        const balance1 = await rewardToken.balanceOf(delegator1);
        const balance2 = await rewardToken.balanceOf(delegator2);

        assertNoZerosBalanceDistribution([balance1, balance2], [1, 2], 150);
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

      const poolContracts = await deployPool(POOL_PARAMETERS);
      settings = poolContracts.settings;
      govPool = poolContracts.govPool;
      userKeeper = poolContracts.userKeeper;
      validators = poolContracts.validators;
      dp = poolContracts.distributionProposal;
      expertNft = poolContracts.expertNft;

      await setupTokens();

      await token.mint(SECOND, wei("100000000000000000000"));
      await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

      await govPool.deposit(SECOND, wei("3"), [], { from: SECOND });
    });

    describe("onlyBABTHolder modifier reverts", () => {
      it("createProposal()", async () => {
        await truffleAssert.reverts(
          govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], []),
          REVERT_STRING
        );
      });

      it.skip("vote()", async () => {
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.vote(1, wei("100"), [], true), REVERT_STRING);
      });

      it.skip("voteDelegated()", async () => {
        await govPool.deposit(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.delegate(OWNER, wei("500"), [], { from: SECOND });
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.voteDelegated(1, wei("100"), [], true), REVERT_STRING);
      });

      it.skip("voteTreasury()", async () => {
        await govPool.deposit(SECOND, wei("1000"), [], { from: SECOND });
        await govPool.delegate(OWNER, wei("500"), [], { from: SECOND });
        await govPool.createProposal("example.com", [[SECOND, 0, getBytesApprove(SECOND, 1)]], [], {
          from: SECOND,
        });
        await truffleAssert.reverts(govPool.voteTreasury(1, wei("100"), [], true), REVERT_STRING);
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

      it.skip("request()", async () => {
        await truffleAssert.reverts(govPool.request(OWNER, wei("500"), []), REVERT_STRING);
      });

      it("unlock()", async () => {
        await truffleAssert.reverts(govPool.unlock(OWNER, VoteType.PersonalVote), REVERT_STRING);
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
