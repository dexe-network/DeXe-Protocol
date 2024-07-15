const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getBytesLinearPowerInit, getBytesPolynomialPowerInit } = require("../utils/gov-vote-power-utils");
const { getBytesERC20GovInit } = require("../utils/gov-create-token-utils");
const {} = require("../utils/gov-vote-power-utils");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { DEFAULT_CORE_PROPERTIES, VotePowerType } = require("../utils/constants");
const { artifacts } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const BABTMock = artifacts.require("BABTMock");
const WethMock = artifacts.require("WETHMock");
const BscProperties = artifacts.require("BSCProperties");
const ERC20Gov = artifacts.require("ERC20Gov");
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const LinearPower = artifacts.require("LinearPower");
const PolynomialPower = artifacts.require("PolynomialPower");
const CoreProperties = artifacts.require("CoreProperties");
const PoolRegistry = artifacts.require("PoolRegistry");
const TokenAllocator = artifacts.require("TokenAllocator");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");
const PoolFactory = artifacts.require("PoolFactory");
const GovTokenDeployerLib = artifacts.require("GovTokenDeployer");
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
const TokenSaleProposalCreateLib = artifacts.require("TokenSaleProposalCreate");
const TokenSaleProposalBuyLib = artifacts.require("TokenSaleProposalBuy");
const TokenSaleProposalVestingLib = artifacts.require("TokenSaleProposalVesting");
const TokenSaleProposalWhitelistLib = artifacts.require("TokenSaleProposalWhitelist");
const TokenSaleProposalClaimLib = artifacts.require("TokenSaleProposalClaim");
const TokenSaleProposalRecoverLib = artifacts.require("TokenSaleProposalRecover");
const GovValidatorsCreateLib = artifacts.require("GovValidatorsCreate");
const GovValidatorsVoteLib = artifacts.require("GovValidatorsVote");
const GovValidatorsExecuteLib = artifacts.require("GovValidatorsExecute");
const SphereXEngine = artifacts.require("SphereXEngine");

ContractsRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC20Gov.numberFormat = "BigNumber";
WethMock.numberFormat = "BigNumber";
BscProperties.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
TokenAllocator.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
PoolFactory.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
TokenSaleProposal.numberFormat = "BigNumber";

describe("PoolFactory", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let NOTHING;

  let contractsRegistry;
  let poolRegistry;
  let poolFactory;
  let coreProperties;

  let testERC20;
  let testERC721;
  let babt;
  let WETH;
  let tokenAllocator;
  let sphereXEngine;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    NOTHING = await accounts(3);

    const govTokenDeployerLib = await GovTokenDeployerLib.new();

    await PoolFactory.link(govTokenDeployerLib);

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

    const tspCreateLib = await TokenSaleProposalCreateLib.new();
    const tspBuyLib = await TokenSaleProposalBuyLib.new();
    const tspVestingLib = await TokenSaleProposalVestingLib.new();
    const tspWhitelistLib = await TokenSaleProposalWhitelistLib.new();
    const tspClaimLib = await TokenSaleProposalClaimLib.new();
    const tspRecoverLib = await TokenSaleProposalRecoverLib.new();

    await TokenSaleProposal.link(tspCreateLib);
    await TokenSaleProposal.link(tspBuyLib);
    await TokenSaleProposal.link(tspVestingLib);
    await TokenSaleProposal.link(tspWhitelistLib);
    await TokenSaleProposal.link(tspClaimLib);
    await TokenSaleProposal.link(tspRecoverLib);

    const govValidatorsCreateLib = await GovValidatorsCreateLib.new();
    const govValidatorsVoteLib = await GovValidatorsVoteLib.new();
    const govValidatorsExecuteLib = await GovValidatorsExecuteLib.new();

    await GovValidators.link(govValidatorsCreateLib);
    await GovValidators.link(govValidatorsVoteLib);
    await GovValidators.link(govValidatorsExecuteLib);

    testERC20 = await ERC20Mock.new("TestERC20", "TS", 18);
    testERC721 = await ERC721Mock.new("TestERC721", "TS");

    contractsRegistry = await ContractsRegistry.new();
    const DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 6);
    WETH = await WethMock.new();
    networkProperties = await BscProperties.new();
    babt = await BABTMock.new();
    tokenAllocator = await TokenAllocator.new();
    const _dexeExpertNft = await ERC721Expert.new();
    const _coreProperties = await CoreProperties.new();
    const _poolRegistry = await PoolRegistry.new();
    const _poolFactory = await PoolFactory.new();
    sphereXEngine = await SphereXEngine.new(0, OWNER);

    await contractsRegistry.__MultiOwnableContractsRegistry_init();
    await networkProperties.__NetworkProperties_init(WETH.address);

    await sphereXEngine.grantRole(await sphereXEngine.SENDER_ADDER_ROLE(), contractsRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_SPHEREX_ENGINE_NAME(), sphereXEngine.address);

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), _poolFactory.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.WETH_NAME(), WETH.address);
    await contractsRegistry.addContract(await contractsRegistry.NETWORK_PROPERTIES_NAME(), networkProperties.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babt.address);
    await contractsRegistry.addContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), _dexeExpertNft.address);
    await contractsRegistry.addContract(await contractsRegistry.TOKEN_ALLOCATOR_NAME(), tokenAllocator.address);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());
    poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());

    await sphereXEngine.grantRole(await sphereXEngine.SENDER_ADDER_ROLE(), poolFactory.address);

    await poolRegistry.__MultiOwnablePoolContractsRegistry_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependenciesBatch([
      await contractsRegistry.POOL_FACTORY_NAME(),
      await contractsRegistry.POOL_REGISTRY_NAME(),
      await contractsRegistry.CORE_PROPERTIES_NAME(),
      await contractsRegistry.TOKEN_ALLOCATOR_NAME(),
    ]);

    let distributionProposal = await DistributionProposal.new();
    let tokenSaleProposal = await TokenSaleProposal.new();
    let expertNft = await ERC721Expert.new();
    let nftMultiplier = await ERC721Multiplier.new();
    let linearPower = await LinearPower.new();
    let polynomialPower = await PolynomialPower.new();

    let govPool = await GovPool.new();
    let govUserKeeper = await GovUserKeeper.new();
    let govSettings = await GovSettings.new();
    let govValidators = await GovValidators.new();

    const poolNames = [
      await poolRegistry.GOV_POOL_NAME(),
      await poolRegistry.USER_KEEPER_NAME(),
      await poolRegistry.SETTINGS_NAME(),
      await poolRegistry.VALIDATORS_NAME(),
      await poolRegistry.DISTRIBUTION_PROPOSAL_NAME(),
      await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
      await poolRegistry.EXPERT_NFT_NAME(),
      await poolRegistry.NFT_MULTIPLIER_NAME(),
      await poolRegistry.LINEAR_POWER_NAME(),
      await poolRegistry.POLYNOMIAL_POWER_NAME(),
    ];

    const poolAddrs = [
      govPool.address,
      govUserKeeper.address,
      govSettings.address,
      govValidators.address,
      distributionProposal.address,
      tokenSaleProposal.address,
      expertNft.address,
      nftMultiplier.address,
      linearPower.address,
      polynomialPower.address,
    ];

    await poolRegistry.setNewImplementations(poolNames, poolAddrs);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("GovPools", () => {
    function getGovPoolSaleConfiguredParams() {
      let POOL_PARAMETERS = {
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
              minVotesForCreating: wei("5"),
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
              validatorsVote: false,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("5"),
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
              delegatedVotingAllowed: false,
              validatorsVote: true,
              duration: 500,
              durationValidators: 600,
              quorum: PRECISION.times("51").toFixed(),
              quorumValidators: PRECISION.times("61").toFixed(),
              minVotesForVoting: wei("10"),
              minVotesForCreating: wei("5"),
              executionDelay: 0,
              rewardsInfo: {
                rewardToken: ZERO_ADDR,
                creationReward: 0,
                executionReward: 0,
                voteRewardsCoefficient: 0,
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
            duration: 500,
            executionDelay: 0,
            quorum: PRECISION.times("51").toFixed(),
          },
          validators: [OWNER],
          balances: [wei("100")],
        },
        userKeeperParams: {
          tokenAddress: testERC20.address,
          nftAddress: testERC721.address,
          individualPower: wei("1000"),
          nftsTotalSupply: 33,
        },
        tokenParams: {
          name: "gov token",
          symbol: "st",
          users: [],
          cap: wei("1000"),
          mintedTotal: wei("150"),
          amounts: [],
        },
        votePowerParams: {
          voteType: VotePowerType.LINEAR_VOTES,
          initData: getBytesLinearPowerInit(),
          presetAddress: ZERO_ADDR,
        },
        verifier: OWNER,
        onlyBABTHolders: false,
        descriptionURL: "example.com",
        name: "Pool name",
      };

      POOL_PARAMETERS.settingsParams.proposalSettings.push({
        earlyCompletion: false,
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 500,
        durationValidators: 600,
        quorum: PRECISION.times("51").toFixed(),
        quorumValidators: PRECISION.times("61").toFixed(),
        minVotesForVoting: wei("10"),
        minVotesForCreating: wei("5"),
        executionDelay: 0,
        rewardsInfo: {
          rewardToken: ZERO_ADDR,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        },
        executorDescription: "Token Sale",
      });

      POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(ZERO_ADDR);

      return POOL_PARAMETERS;
    }

    describe("deployGovPool", () => {
      it("should deploy pool with token", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses.govToken;
        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        let tx = await poolFactory.deployGovPool(POOL_PARAMETERS);
        let event = tx.receipt.logs[0];

        let tokenSale = await TokenSaleProposal.at(event.args.tokenSale);
        let token = await ERC20Mock.at(event.args.token);
        let dp = await DistributionProposal.at(event.args.distributionProposal);
        let localExpertNft = await ERC721Expert.at(event.args.govPoolDeps.expertNftAddress);
        let nftMultiplier = await ERC721Multiplier.at(event.args.govPoolDeps.nftMultiplierAddress);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(govPool.address, predictedGovAddresses.govPool);
        assert.equal(token.address, predictedGovAddresses.govToken);
        assert.equal(tokenSale.address, predictedGovAddresses.govTokenSale);
        assert.equal(dp.address, predictedGovAddresses.distributionProposal);
        assert.equal(localExpertNft.address, predictedGovAddresses.expertNft);
        assert.equal(nftMultiplier.address, predictedGovAddresses.nftMultiplier);

        let helperContracts = await govPool.getHelperContracts();

        let govUserKeeper = await GovUserKeeper.at(helperContracts[1]);

        assert.equal(await token.totalSupply(), wei("150"));
        assert.equal(await token.balanceOf(govPool.address), wei("150"));

        assert.equal(await tokenSale.latestTierId(), "0");

        assert.equal(await govUserKeeper.tokenAddress(), token.address);
        assert.equal(await govUserKeeper.wethAddress(), WETH.address);
        assert.equal(await govUserKeeper.networkPropertiesAddress(), networkProperties.address);

        const votePower = await PolynomialPower.at(helperContracts[4]);

        assert.equal(await votePower.transformVotes(ZERO_ADDR, 2), 2);
      });

      it("should revert with protection on and deploy with off", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        await sphereXEngine.configureRules("0x0000000000000001");
        await poolRegistry.protectPoolFunctions(await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(), ["0x69130451"]);
        await poolRegistry.toggleSphereXEngine(true);

        await truffleAssert.reverts(poolFactory.deployGovPool(POOL_PARAMETERS), "SphereX error: disallowed tx pattern");

        await poolRegistry.unprotectPoolFunctions(await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(), ["0x69130451"]);

        await poolFactory.deployGovPool(POOL_PARAMETERS);
      });

      it("should set babt id correctly", async () => {
        await babt.attest(OWNER);

        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);

        assert.equal(await govPool.deployerBABTid(), "1");
      });

      it("should deploy pool with polynomial votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.voteType = VotePowerType.POLYNOMIAL_VOTES;
        POOL_PARAMETERS.votePowerParams.initData = getBytesPolynomialPowerInit(1, 2, 3);

        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        const votePower = await PolynomialPower.at(helperContracts[4]);

        assert.equal((await votePower.getVoteCoefficients())[0], 1);
        assert.equal((await votePower.getVoteCoefficients())[1], 2);
        assert.equal((await votePower.getVoteCoefficients())[2], 3);
      });

      it("should deploy pool with custom votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.voteType = VotePowerType.CUSTOM_VOTES;
        POOL_PARAMETERS.votePowerParams.initData = "0x";
        POOL_PARAMETERS.votePowerParams.presetAddress = (await LinearPower.new()).address;

        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        let govPool = await GovPool.at((await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 1))[0]);
        let helperContracts = await govPool.getHelperContracts();

        const votePower = await LinearPower.at(helperContracts[4]);

        assert.equal(await votePower.transformVotes(ZERO_ADDR, 2), 2);
      });

      it("should revert if error during init polynomial votes", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.votePowerParams.initData = getBytesPolynomialPowerInit(1, 2, 3);

        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await truffleAssert.reverts(poolFactory.deployGovPool(POOL_PARAMETERS), "PoolFactory: power init failed");
      });
    });

    describe("deploy2 validation", () => {
      it("should deploy pools with the same name from different deployers", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddressOwner = (await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name))[0];
        const predictedAddressSecond = (await poolFactory.predictGovAddresses(SECOND, POOL_PARAMETERS.name))[0];

        assert.notEqual(predictedAddressOwner, ZERO_ADDR);
        assert.notEqual(predictedAddressSecond, ZERO_ADDR);
        assert.notEqual(predictedAddressOwner, predictedAddressSecond);

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.settingsParams.additionalProposalExecutors[0] = predictedGovAddresses.govTokenSale;

        await poolFactory.deployGovPool(POOL_PARAMETERS);
        await poolFactory.deployGovPool(POOL_PARAMETERS, { from: SECOND });

        assert.deepEqual(await poolRegistry.listPools(await poolRegistry.GOV_POOL_NAME(), 0, 2), [
          predictedAddressOwner,
          predictedAddressSecond,
        ]);
      });

      it("should not deploy pools with the same salt", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        await poolFactory.deployGovPool(POOL_PARAMETERS);

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name is already taken",
        );
      });

      it("should revert if name is an empty string", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        POOL_PARAMETERS.name = "";

        await truffleAssert.reverts(
          poolFactory.deployGovPool(POOL_PARAMETERS),
          "PoolFactory: pool name cannot be empty",
        );
      });
    });

    describe("predictGovAddress", () => {
      it("should return zero address if name is an empty string", async () => {
        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, "");

        assert.equal(predictedAddress.govPool, ZERO_ADDR);
        assert.equal(predictedAddress.govToken, ZERO_ADDR);
        assert.equal(predictedAddress.govTokenSale, ZERO_ADDR);
        assert.equal(predictedAddress.distributionProposal, ZERO_ADDR);
        assert.equal(predictedAddress.expertNft, ZERO_ADDR);
        assert.equal(predictedAddress.nftMultiplier, ZERO_ADDR);
      });
    });

    describe("token allocation", () => {
      let merkleTree;
      const DESCRIPTION_URL = "ipfs address";

      beforeEach(async () => {
        merkleTree = StandardMerkleTree.of(
          [
            [SECOND, wei("10")],
            [THIRD, wei("5")],
          ],
          ["address", "uint256"],
        );
      });

      it("injects only from injector address", async () => {
        await truffleAssert.reverts(
          tokenAllocator.setDependencies(contractsRegistry.address, "0x"),
          "Dependant: not an injector",
        );
      });

      it("sets token allocator address correct", async () => {
        assert.equal(await contractsRegistry.getTokenAllocatorContract(), tokenAllocator.address);
      });

      it("could create token allocation", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses.govToken;
        POOL_PARAMETERS.tokenParams.users.push(tokenAllocator.address);
        POOL_PARAMETERS.tokenParams.amounts.push(wei("15"));
        POOL_PARAMETERS.tokenParams.users.push(THIRD);
        POOL_PARAMETERS.tokenParams.amounts.push(wei("1"));

        await tokenAllocator.allocateAndDeployGovPool(merkleTree.root, DESCRIPTION_URL, POOL_PARAMETERS);

        const token = await ERC20Mock.at(predictedGovAddresses.govToken);
        assert.equal((await token.balanceOf(tokenAllocator.address)).toFixed(), wei("15"));

        const info = await tokenAllocator.getAllocationInfo(1);
        assert.equal(info.id, "1");
        assert.equal(info.isClosed, false);
        assert.equal(info.allocator, predictedGovAddresses.govPool);
        assert.equal(info.token, token.address);
        assert.equal(info.currentBalance, wei("15"));
        assert.equal(info.merkleRoot, merkleTree.root);
      });

      it("reverts if not new gov token", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        POOL_PARAMETERS.userKeeperParams.tokenAddress = testERC20.address;
        POOL_PARAMETERS.tokenParams.users.push(tokenAllocator.address);
        POOL_PARAMETERS.tokenParams.amounts.push(wei("15"));

        await truffleAssert.reverts(
          tokenAllocator.allocateAndDeployGovPool(merkleTree.root, DESCRIPTION_URL, POOL_PARAMETERS),
          "TA: Could preallocate only the new GovToken",
        );
      });

      it("reverts if double allocation", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses.govToken;
        POOL_PARAMETERS.tokenParams.users.push(tokenAllocator.address);
        POOL_PARAMETERS.tokenParams.amounts.push(wei("15"));
        POOL_PARAMETERS.tokenParams.users.push(tokenAllocator.address);
        POOL_PARAMETERS.tokenParams.amounts.push(wei("20"));

        await truffleAssert.reverts(
          tokenAllocator.allocateAndDeployGovPool(merkleTree.root, DESCRIPTION_URL, POOL_PARAMETERS),
          "TA: multiple allocations in GovPool params",
        );
      });

      it("reverts if no allocation", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedGovAddresses = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);

        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedGovAddresses.govToken;

        await truffleAssert.reverts(
          tokenAllocator.allocateAndDeployGovPool(merkleTree.root, DESCRIPTION_URL, POOL_PARAMETERS),
          "TA: no allocation in GovPool params",
        );
      });
    });

    describe("createTokenAndDeployPool", () => {
      let erc20Gov;

      beforeEach("", async () => {
        erc20Gov = await ERC20Gov.new();
      });

      it("different methods deploy GovToken on different addresses", async () => {
        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, "Test");

        const address0 = predictedAddress.govToken;
        const address1 = await poolFactory.predictTokenAddress(erc20Gov.address, OWNER, "Test");

        assert.isFalse(address0 == address1);
      });

      it("reverts on wrong token address", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);
        const predictedGovAddresses = predictedAddress.govPool;
        POOL_PARAMETERS.userKeeperParams.tokenAddress = erc20Gov.address;

        await truffleAssert.reverts(
          poolFactory.createTokenAndDeployPool(
            erc20Gov.address,
            getBytesERC20GovInit([predictedGovAddresses, ["gov token", "st", [], wei("1000"), wei("150"), []]]),
            predictedGovAddresses,
            POOL_PARAMETERS,
          ),
          "Pool Factory: wrong address",
        );
      });

      it("reverts on wrong govpool address", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);
        const predictedGovAddresses = predictedAddress.govPool;
        const predictedTokenAddress = await poolFactory.predictTokenAddress(
          erc20Gov.address,
          OWNER,
          POOL_PARAMETERS.name,
        );
        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedTokenAddress;

        await truffleAssert.reverts(
          poolFactory.createTokenAndDeployPool(
            erc20Gov.address,
            getBytesERC20GovInit([predictedGovAddresses, ["gov token", "st", [], wei("1000"), wei("150"), []]]),
            OWNER,
            POOL_PARAMETERS,
          ),
          "Pool Factory: unexpected pool address",
        );
      });

      it("reverts on wrong initialization", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);
        const predictedGovAddresses = predictedAddress.govPool;
        const predictedTokenAddress = await poolFactory.predictTokenAddress(
          erc20Gov.address,
          OWNER,
          POOL_PARAMETERS.name,
        );
        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedTokenAddress;

        await truffleAssert.reverts(
          poolFactory.createTokenAndDeployPool(erc20Gov.address, "0x", predictedGovAddresses, POOL_PARAMETERS),
          "Pool Factory: can't initialize token",
        );
      });

      it("passes on correct parameters", async () => {
        let POOL_PARAMETERS = getGovPoolSaleConfiguredParams();

        const predictedAddress = await poolFactory.predictGovAddresses(OWNER, POOL_PARAMETERS.name);
        const predictedGovAddresses = predictedAddress.govPool;
        const predictedTokenAddress = await poolFactory.predictTokenAddress(
          erc20Gov.address,
          OWNER,
          POOL_PARAMETERS.name,
        );
        POOL_PARAMETERS.userKeeperParams.tokenAddress = predictedTokenAddress;

        await poolFactory.createTokenAndDeployPool(
          erc20Gov.address,
          getBytesERC20GovInit([predictedGovAddresses, ["gov token", "st", [], wei("1000"), wei("150"), []]]),
          predictedGovAddresses,
          POOL_PARAMETERS,
        );
      });
    });
  });
});
