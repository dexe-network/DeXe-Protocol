const { assert } = require("chai");
const { toPercent } = require("../utils/utils");
const { accounts, wei, toBN } = require("../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../helpers/block-helper");
const { PRECISION, ETHER_ADDR } = require("../../scripts/utils/constants");
const { DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getBytesApprove } = require("../utils/gov-pool-utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const GovValidators = artifacts.require("GovValidators");
const GovSettings = artifacts.require("GovSettings");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721Power = artifacts.require("ERC721Power");
const ERC721Expert = artifacts.require("ERC721Expert");
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
const DexeERC721Multiplier = artifacts.require("DexeERC721Multiplier");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721Expert.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
DexeERC721Multiplier.numberFormat = "BigNumber";

describe("DexeERC721Multiplier", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FACTORY;

  let govPool;
  let nft;

  let contractsRegistry;
  let coreProperties;
  let poolRegistry;

  let token;
  let nftPower;
  let rewardToken;
  let babt;

  let dexeExpertNft;
  let userKeeper;

  const toMultiplier = (value) => PRECISION.times(value);
  const fromMultiplier = (value) => toBN(value).idiv(PRECISION);

  const NFT_NAME = "NFTMultiplierMock";
  const NFT_SYMBOL = "NFTMM";

  let TOKENS;

  const reverter = new Reverter();

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(3);

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

  async function deployPool(poolParams) {
    const NAME = await poolRegistry.GOV_POOL_NAME();

    const settings = await GovSettings.new();
    const validators = await GovValidators.new();
    const userKeeper = await GovUserKeeper.new();
    const dp = await DistributionProposal.new();
    const expertNft = await ERC721Expert.new();
    const govPool = await GovPool.new();

    const nft = await DexeERC721Multiplier.new();

    await settings.__GovSettings_init(
      govPool.address,
      validators.address,
      userKeeper.address,
      poolParams.settingsParams.proposalSettings,
      poolParams.settingsParams.additionalProposalExecutors
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

    await nft.__DexeERC721Multiplier_init(NFT_NAME, NFT_SYMBOL, govPool.address);

    await dp.__DistributionProposal_init(govPool.address);
    await expertNft.__ERC721Expert_init("Mock Expert Nft", "MCKEXPNFT");
    await govPool.__GovPool_init(
      [settings.address, userKeeper.address, validators.address, expertNft.address, nft.address],
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
      nft: nft,
    };
  }

  let POOL_PARAMETERS;

  beforeEach("setup", async () => {
    POOL_PARAMETERS = await getPoolParameters(nftPower.address);

    let poolContracts = await deployPool(POOL_PARAMETERS);
    govPool = poolContracts.govPool;
    userKeeper = poolContracts.userKeeper;
    nft = poolContracts.nft;
  });

  describe("initializer", async () => {
    it("should initialize properly if all conditions are met", async () => {
      assert.equal(await nft.name(), NFT_NAME);
      assert.equal(await nft.symbol(), NFT_SYMBOL);
      assert.equal(await nft.baseURI(), "");
    });

    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        nft.__DexeERC721Multiplier_init(NFT_NAME, NFT_SYMBOL, govPool.address),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionality", async () => {
    beforeEach(async () => {
      TOKENS = [
        {
          id: "1",
          multiplier: toMultiplier("1337").toFixed(),
          duration: "1000",
          averageBalance: "1000",
          owner: SECOND,
        },
        {
          id: "2",
          multiplier: toMultiplier("20").toFixed(),
          duration: "500",
          averageBalance: "2000",
          owner: THIRD,
        },
        {
          id: "3",
          multiplier: toMultiplier("1.5").toFixed(),
          duration: "200",
          averageBalance: "3000",
          owner: SECOND,
        },
        {
          id: "4",
          multiplier: toMultiplier("5.125").toFixed(),
          duration: "7050",
          averageBalance: "4000",
          owner: THIRD,
        },
      ];
    });

    describe("interfaceId()", () => {
      it("should support ERC721Enumerable and ERC721Multiplier interfaces", async () => {
        assert.isTrue(await nft.supportsInterface("0x9347d1fc"));
        assert.isTrue(await nft.supportsInterface("0x780e9d63"));
      });
    });

    describe("mint()", () => {
      it("should mint properly", async () => {
        for (const token of TOKENS) {
          const tx = await nft.mint(token.owner, token.multiplier, token.duration, token.averageBalance);
          truffleAssert.eventEmitted(tx, "Minted", (e) => {
            return (
              e.to === token.owner &&
              e.tokenId.toFixed() === token.id &&
              e.multiplier.toFixed() === token.multiplier &&
              e.duration.toFixed() === token.duration &&
              e.averageBalance.toFixed() === token.averageBalance
            );
          });
        }

        assert.equal(await nft.totalSupply(), "4");
        assert.equal(await nft.balanceOf(SECOND), "2");
        assert.equal(await nft.balanceOf(THIRD), "2");
        assert.equal(await nft.tokenOfOwnerByIndex(SECOND, "0"), "1");
        assert.equal(await nft.tokenOfOwnerByIndex(SECOND, "1"), "3");
        assert.equal(await nft.tokenOfOwnerByIndex(THIRD, "0"), "2");
        assert.equal(await nft.tokenOfOwnerByIndex(THIRD, "1"), "4");
      });
    });

    describe("if minted", () => {
      beforeEach(async () => {
        for (const token of TOKENS) {
          await nft.mint(token.owner, token.multiplier, token.duration, token.averageBalance);
        }
      });

      describe("changeToken()", () => {
        it("should change properly", async () => {
          const first = TOKENS[0];

          const tx = await nft.changeToken(first.id, 1, 2, 3);

          truffleAssert.eventEmitted(tx, "Changed", (e) => {
            return (
              e.tokenId.toFixed() === first.id &&
              e.multiplier.toFixed() === "1" &&
              e.duration.toFixed() === "2" &&
              e.averageBalance.toFixed() === "3"
            );
          });
        });
      });

      describe("getExtraRewards()", () => {
        it("should return zero if no nft locked", async () => {
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should return extra rewards properly", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          console.log(TOKENS[2]);
          const amount = "1000";

          const currentMultiplier =
            fromMultiplier(TOKENS[2].multiplier) /
            (amount / (TOKENS[2].averageBalance * fromMultiplier(TOKENS[2].multiplier)));

          assert.equal((await nft.getExtraRewards(SECOND, amount)).toFixed(), currentMultiplier * amount);
        });

        it("should return zero if nft is expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should change reward if the second nft is locked", async () => {
          const startTime = await getCurrentBlockTime();
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1337000");
          await setTime(startTime + parseInt(TOKENS[0].duration) + 1);
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock(TOKENS[2].id, { from: TOKENS[2].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should return extra rewards properly if locked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: OWNER });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is unlocked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock(TOKENS[2].id, { from: OWNER });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });
      });

      describe("getCurrentMultiplier()", () => {
        it("should return zeros if no nft locked", async () => {
          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier, "0");
          assert.equal(info.timeLeft, "0");
        });

        it("should return current multiplier and timeLeft properly if locked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          let info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), TOKENS[2].duration);

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) - 1);

          info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), "1");
        });

        it("should return zeros if nft expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);

          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return zeros if nft unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await nft.unlock(TOKENS[2].id, { from: TOKENS[2].owner });

          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return current multiplier and timeLeft properly if locked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: OWNER });

          let info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), TOKENS[2].duration);

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) - 1);

          info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), "1");
        });

        it("should return zeros if nft unlocked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await nft.unlock(TOKENS[2].id, { from: OWNER });

          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });
      });

      describe("transferFrom", () => {
        it("should not transfer if nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          await truffleAssert.reverts(
            nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner }),
            "ERC721Multiplier: Cannot transfer locked token"
          );
        });

        it("should transfer if nft is not locked", async () => {
          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.ownerOf(TOKENS[0].id), TOKENS[1].owner);
        });

        it("should transfer if nft is unlocked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.unlock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.ownerOf(TOKENS[0].id), TOKENS[1].owner);
        });
      });
    });
  });
});