const { assert } = require("chai");
const { accounts, wei } = require("../scripts/utils/utils");
const { PRECISION, ZERO_ADDR } = require("../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const { DEFAULT_CORE_PROPERTIES } = require("./utils/constants");
const {
  getBytesMintERC20Sale,
  getBytesBurnERC20Sale,
  getBytesPauseERC20Sale,
  getBytesUnpauseERC20Sale,
} = require("./utils/gov-pool-utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
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
ERC20Sale.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";

describe("ERC20Sale", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let SALE_ADDRESS;
  let DEFAULT_PARAMS;
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
  }

  describe("constructor", () => {
    beforeEach(async () => {
      DEFAULT_PARAMS = {
        govAddress: NOTHING,
        saleAddress: SALE_ADDRESS,
        constructorParameters: {
          name: "ERC20SaleMocked",
          symbol: "ERC20SM",
          users: [SECOND, THIRD],
          saleAmount: wei(1),
          cap: wei(20),
          mintedTotal: wei(10),
          amounts: [wei(2), wei(3)],
        },
      };
    });

    it("should revert if gov address is zero", async () => {
      DEFAULT_PARAMS.govAddress = ZERO_ADDR;

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: govAddress is zero"
      );
    });

    it("should revert if mintedTotal greater than cap", async () => {
      DEFAULT_PARAMS.constructorParameters.mintedTotal = wei(30);

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: mintedTotal should not be greater than cap"
      );
    });

    it("should revert if arrays length are not equal", async () => {
      DEFAULT_PARAMS.constructorParameters.users = [];

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: users and amounts lengths mismatch"
      );
    });

    it("should revert if the sum of amounts is greater than totalMinted", async () => {
      DEFAULT_PARAMS.constructorParameters.amounts = [wei(10), wei(10)];

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: overminting"
      );
    });

    it("should deploy properly if all conditions are met", async () => {
      erc20Sale = await ERC20Sale.new(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );

      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[0])).toFixed(), wei(2));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[1])).toFixed(), wei(3));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.saleAddress)).toFixed(), wei(1));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.govAddress)).toFixed(), wei(4));
    });
  });

  describe("proposals", () => {
    const acceptProposal = async (executors, values, bytes) => {
      await govPool.createProposal("example.com", "misc", executors, values, bytes);

      const proposalId = await govPool.latestProposalId();

      await govPool.vote(proposalId, 0, [], wei("1000"), []);
      await govPool.vote(proposalId, 0, [], wei("100000000000000000000"), [], { from: SECOND });

      await govPool.execute(proposalId);
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

      DEFAULT_PARAMS = {
        govAddress: govPool.address,
        saleAddress: SALE_ADDRESS,
        constructorParameters: {
          name: "ERC20SaleMocked",
          symbol: "ERC20SM",
          users: [SECOND, THIRD],
          saleAmount: wei(1),
          cap: wei(20),
          mintedTotal: wei(10),
          amounts: [wei(2), wei(3)],
        },
      };

      erc20Sale = await ERC20Sale.new(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );

      await token.mint(SECOND, wei("100000000000000000000"));

      await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

      await govPool.deposit(OWNER, wei("1000"), []);
      await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
    });

    describe("onlyGov", () => {
      it("should not mint if the caller is not a govPool", async () => {
        await truffleAssert.reverts(erc20Sale.mint(SALE_ADDRESS, wei(1)), "ERC20Sale: not a Gov contract");
      });

      it("should not burn if the caller is not a govPool", async () => {
        await truffleAssert.reverts(erc20Sale.burn(SALE_ADDRESS, wei(1)), "ERC20Sale: not a Gov contract");
      });

      it("should not pause if the caller is not a govPool", async () => {
        await truffleAssert.reverts(erc20Sale.pause(), "ERC20Sale: not a Gov contract");
      });

      it("should not unpause if the caller is not a govPool", async () => {
        await truffleAssert.reverts(erc20Sale.unpause(), "ERC20Sale: not a Gov contract");
      });
    });

    describe("mint", () => {
      it("should not mint if the cap is reached", async () => {
        await truffleAssert.reverts(
          acceptProposal([erc20Sale.address], [0], [getBytesMintERC20Sale(OWNER, wei(100))]),
          "ERC20Capped: cap exceeded"
        );
      });

      it("should mint if all conditions are met", async () => {
        assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), "0");

        await acceptProposal([erc20Sale.address], [0], [getBytesMintERC20Sale(OWNER, wei(1))]);

        assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(1));
      });
    });

    describe("burn", () => {
      it("should not burn if not enough balance", async () => {
        await truffleAssert.reverts(
          acceptProposal([erc20Sale.address], [0], [getBytesBurnERC20Sale(SALE_ADDRESS, wei(100))]),
          "ERC20: burn amount exceeds balance"
        );
      });

      it("should not burn all conditions are met", async () => {
        assert.equal((await erc20Sale.balanceOf(SALE_ADDRESS)).toFixed(), wei(1));

        await acceptProposal([erc20Sale.address], [0], [getBytesBurnERC20Sale(SALE_ADDRESS, wei(1))]);

        assert.equal((await erc20Sale.balanceOf(SALE_ADDRESS)).toFixed(), "0");
      });
    });

    describe("pause", () => {
      it("should not mint if the erc20Sale is paused", async () => {
        await acceptProposal([erc20Sale.address], [0], [getBytesPauseERC20Sale()]);

        await truffleAssert.reverts(
          acceptProposal([erc20Sale.address], [0], [getBytesMintERC20Sale(OWNER, wei(1))]),
          "ERC20Pausable: token transfer while paused"
        );
      });

      it("should not transfer if the erc20Sale is paused", async () => {
        await acceptProposal([erc20Sale.address], [0], [getBytesPauseERC20Sale()]);

        await truffleAssert.reverts(
          erc20Sale.transfer(THIRD, wei(1), { from: SECOND }),
          "ERC20Pausable: token transfer while paused"
        );
      });
    });

    describe("unpause", () => {
      beforeEach(async () => {
        await acceptProposal([erc20Sale.address], [0], [getBytesPauseERC20Sale()]);
        await acceptProposal([erc20Sale.address], [0], [getBytesUnpauseERC20Sale()]);
      });

      it("should mint if the erc20Sale is unpaused", async () => {
        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(2));

        await acceptProposal([erc20Sale.address], [0], [getBytesMintERC20Sale(SECOND, wei(1))]);

        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(3));
      });

      it("should transfer if the erc20Sale is unpaused", async () => {
        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(2));
        assert.equal((await erc20Sale.balanceOf(THIRD)).toFixed(), wei(3));

        await erc20Sale.transfer(THIRD, wei(1), { from: SECOND });

        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(1));
        assert.equal((await erc20Sale.balanceOf(THIRD)).toFixed(), wei(4));
      });
    });
  });
});
