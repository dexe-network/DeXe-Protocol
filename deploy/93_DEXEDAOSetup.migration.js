const { Reporter } = require("@solarity/hardhat-migrate");

const config = require("./config/config.json");
const { getBytesPolynomialPowerInit } = require("./config/utils.js");

const { ZERO_ADDR, PRECISION } = require("../scripts/utils/constants");
const { accounts, wei } = require("../scripts/utils/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolFactory = artifacts.require("PoolFactory");

let POOL_PARAMETERS = {
  settingsParams: {
    proposalSettings: [
      {
        earlyCompletion: true,
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 600,
        durationValidators: 600,
        quorum: PRECISION.times("0.00001").toFixed(),
        quorumValidators: PRECISION.times("0.00001").toFixed(),
        minVotesForVoting: wei("10"),
        minVotesForCreating: wei("1"),
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
        delegatedVotingAllowed: false,
        validatorsVote: false,
        duration: 600,
        durationValidators: 600,
        quorum: PRECISION.times("0.00001").toFixed(),
        quorumValidators: PRECISION.times("0.00001").toFixed(),
        minVotesForVoting: wei("10"),
        minVotesForCreating: wei("1"),
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
        validatorsVote: false,
        duration: 600,
        durationValidators: 600,
        quorum: PRECISION.times("0.00001").toFixed(),
        quorumValidators: PRECISION.times("0.00001").toFixed(),
        minVotesForVoting: wei("10"),
        minVotesForCreating: wei("1"),
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
    name: "DEXE Validator Token",
    symbol: "DVT",
    proposalSettings: {
      duration: 600,
      executionDelay: 0,
      quorum: PRECISION.times("0.00001").toFixed(),
    },
    validators: [],
    balances: [],
  },
  userKeeperParams: {
    tokenAddress: config.tokens.DEXE,
    nftAddress: ZERO_ADDR,
    individualPower: 0,
    nftsTotalSupply: 0,
  },
  tokenSaleParams: {
    tiersParams: [],
    whitelistParams: [],
    tokenParams: {
      name: "",
      symbol: "",
      users: [],
      saleAmount: 0,
      cap: 0,
      mintedTotal: 0,
      amounts: [],
    },
  },
  votePowerParams: {
    voteType: 1,
    initData: getBytesPolynomialPowerInit(PRECISION.times("1.08"), PRECISION.times("0.92"), PRECISION.times("0.97")),
    presetAddress: ZERO_ADDR,
  },
  verifier: ZERO_ADDR,
  onlyBABTHolders: false,
  descriptionURL: "",
  name: config.DEXEDAO.name,
};

const DP_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: true,
  validatorsVote: false,
  duration: 600,
  durationValidators: 600,
  quorum: PRECISION.times("0.00001").toFixed(),
  quorumValidators: PRECISION.times("0.00001").toFixed(),
  minVotesForVoting: wei("10"),
  minVotesForCreating: wei("1"),
  executionDelay: 0,
  rewardsInfo: {
    rewardToken: config.tokens.DEXE,
    creationReward: wei("10"),
    executionReward: wei("15"),
    voteRewardsCoefficient: PRECISION.times("10").toFixed(),
  },
  executorDescription: "dp",
};

const TOKENSALE_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: false,
  validatorsVote: false,
  duration: 600,
  durationValidators: 600,
  quorum: PRECISION.times("0.00001").toFixed(),
  quorumValidators: PRECISION.times("0.00001").toFixed(),
  minVotesForVoting: wei("10"),
  minVotesForCreating: wei("1"),
  executionDelay: 0,
  rewardsInfo: {
    rewardToken: config.tokens.DEXE,
    creationReward: wei("10"),
    executionReward: wei("15"),
    voteRewardsCoefficient: PRECISION.times("10").toFixed(),
  },
  executorDescription: "tokensale",
};

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolFactory = await deployer.deployed(PoolFactory, await contractsRegistry.getPoolFactoryContract());

  const predictedGovAddresses = await poolFactory.predictGovAddresses(await accounts(0), POOL_PARAMETERS.name);
  deployer.dexeDaoAddress = predictedGovAddresses.govPool;

  await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), deployer.dexeDaoAddress);

  POOL_PARAMETERS.settingsParams.proposalSettings.push(DP_SETTINGS);
  POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(predictedGovAddresses.distributionProposal);

  POOL_PARAMETERS.settingsParams.proposalSettings.push(TOKENSALE_SETTINGS);
  POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(predictedGovAddresses.govTokenSale);

  await poolFactory.deployGovPool(POOL_PARAMETERS);

  Reporter.reportContracts(["DEXE DAO", deployer.dexeDaoAddress]);
};
