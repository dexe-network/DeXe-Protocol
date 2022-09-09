const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { getBytesDistributionProposal } = require("./utils/gov-pool-utils");
const { ZERO, PRECISION, DEFAULT_CORE_PROPERTIES } = require("./utils/constants");
const { assert } = require("chai");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const unlockAndMint = async (address) => {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  await network.provider.send("hardhat_setBalance", [address, "0xFFFFFFFFFFFFFFFF"]);
};

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

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(4);
    NOTHING = await accounts(9);
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
  }

  describe("Bad DP", () => {
    it("should revert if _govAddress is zero", async () => {
      dp = await DistributionProposal.new();

      await truffleAssert.reverts(dp.__DistributionProposal_init(ZERO), "DP: _govAddress is zero");
    });
  });

  describe("DP", () => {
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
            rewardToken: ZERO,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
            executorDescription: "internal",
          },
          distributionProposalSettings: {
            earlyCompletion: false,
            delegatedVotingAllowed: false,
            validatorsVote: false,
            duration: 700,
            durationValidators: 800,
            quorum: PRECISION.times("71").toFixed(),
            quorumValidators: PRECISION.times("100").toFixed(),
            minVotesForVoting: wei("20"),
            minVotesForCreating: wei("3"),
            rewardToken: ZERO,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
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
            rewardToken: ZERO,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
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
            rewardToken: ZERO,
            creationReward: 0,
            executionReward: 0,
            voteRewardsCoefficient: 0,
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
          tokenAddress: ZERO,
          nftAddress: nft.address,
          totalPowerInTokens: wei("33000"),
          nftsTotalSupply: 33,
        },
        descriptionURL: "example.com",
      };

      await deployPool(POOL_PARAMETERS);
      await setupTokens();
    });

    describe("constructor", () => {
      it("should set parameter correctly", async () => {
        assert.equal(await dp.govAddress(), govPool.address);
      });
    });

    describe("execute()", () => {
      let startTime;

      beforeEach(async () => {
        startTime = await getCurrentBlockTime();

        await govPool.deposit(OWNER, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        await setTime(startTime + 999);
        await govPool.createProposal(
          "example.com",
          [dp.address],
          [0],
          [getBytesDistributionProposal(1, token.address, wei("100"))]
        );

        await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        await setTime(startTime + 2000);

        await unlockAndMint(govPool.address);
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
        await govPool.execute(1);

        await truffleAssert.reverts(
          dp.execute(1, token.address, wei("100"), { from: govPool.address }),
          "DP: proposal already exist"
        );
      });

      it("should revert when address is zero", async () => {
        await truffleAssert.reverts(dp.execute(1, ZERO, wei("100"), { from: govPool.address }), "DP: zero address");
      });

      it("should revert when amount is zero", async () => {
        await truffleAssert.reverts(dp.execute(1, token.address, "0", { from: govPool.address }), "DP: zero amount");
      });
    });

    describe("claim()", () => {
      let startTime;

      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();

        await govPool.deposit(SECOND, 0, [1, 2, 3, 4, 5]);
        await govPool.deposit(THIRD, 0, [6, 7, 8, 9]);

        await setTime(startTime + 999);
        await govPool.createProposal(
          "example.com",
          [dp.address],
          [0],
          [getBytesDistributionProposal(1, token.address, wei("100000"))],
          { from: SECOND }
        );
      });

      it("should correctly claim", async () => {
        await token.mint(dp.address, wei("100000"));

        await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 1700);
        await govPool.execute(1);

        await dp.claim(SECOND, [1]);
        await dp.claim(THIRD, [1]);

        assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
        assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
      });

      it("should claim, when proposal amount < reward", async () => {
        await token.mint(dp.address, wei("10"));

        await unlockAndMint(govPool.address);

        await token.mint(govPool.address, wei("100000"));
        await token.approve(dp.address, wei("100000"), { from: govPool.address });

        await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 1700);
        await govPool.execute(1);

        await dp.claim(SECOND, [1]);
        await dp.claim(THIRD, [1]);

        assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
        assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
      });

      it("should revert if already claimed", async () => {
        await token.mint(dp.address, wei("100000"));

        await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
        await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

        await setTime(startTime + 1700);
        await govPool.execute(1);

        await dp.claim(SECOND, [1]);

        await truffleAssert.reverts(dp.claim(SECOND, [1]), "DP: already claimed");
      });

      it("should revert if distribution isn't start yet", async () => {
        await token.mint(dp.address, wei("100000"));

        await truffleAssert.reverts(dp.claim(SECOND, [1]), "DP: zero address");
      });

      it("should revert when array length is zero", async () => {
        await token.mint(dp.address, wei("100000"));

        await truffleAssert.reverts(dp.claim(SECOND, []), "DP: zero array length");
      });

      it("should revert when address is zero", async () => {
        await token.mint(dp.address, wei("100000"));

        await truffleAssert.reverts(dp.claim(ZERO, [1]), "DP: zero address");
      });
    });
  });
});
