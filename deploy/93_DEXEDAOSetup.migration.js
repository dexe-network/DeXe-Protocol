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
        duration: 432000, // 5 days
        durationValidators: 432000, // 5 days
        quorum: PRECISION.times("5").toFixed(), // 5%
        quorumValidators: PRECISION.times("51").toFixed(), // 51%
        minVotesForVoting: wei("13"), // 13 votes
        minVotesForCreating: wei("10000"), // 10000 votes
        executionDelay: 1800, // 30 mins
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
        duration: 432000, // 5 days
        durationValidators: 432000, // 5 days
        quorum: PRECISION.times("5").toFixed(), // 5%
        quorumValidators: PRECISION.times("51").toFixed(), // 51%
        minVotesForVoting: wei("13"), // 13 votes
        minVotesForCreating: wei("10000"), // 10000 votes
        executionDelay: 1800, // 30 mins
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
        duration: 432000, // 5 days
        durationValidators: 432000, // 5 days
        quorum: PRECISION.times("5").toFixed(), // 5%
        quorumValidators: PRECISION.times("51").toFixed(), // 51%
        minVotesForVoting: wei("13"), // 13 votes
        minVotesForCreating: wei("10000"), // 10000 votes
        executionDelay: 1800, // 30 mins
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
    symbol: "DEXEVT",
    proposalSettings: {
      duration: 432000, // 5 days
      executionDelay: 1800, // 30 mins
      quorum: PRECISION.times("51").toFixed(), // 51%
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
  tokenParams: {
    name: "",
    symbol: "",
    users: [],
    cap: 0,
    mintedTotal: 0,
    amounts: [],
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
  earlyCompletion: true,
  delegatedVotingAllowed: true,
  validatorsVote: false,
  duration: 432000, // 5 days
  durationValidators: 432000, // 5 days
  quorum: PRECISION.times("5").toFixed(), // 5%
  quorumValidators: PRECISION.times("51").toFixed(), // 51%
  minVotesForVoting: wei("13"), // 13 votes
  minVotesForCreating: wei("10000"), // 10000 votes
  executionDelay: 1800, // 30 mins
  rewardsInfo: {
    rewardToken: ZERO_ADDR,
    creationReward: 0,
    executionReward: 0,
    voteRewardsCoefficient: 0,
  },
  executorDescription: "distribution-proposal",
};

const TOKENSALE_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: false,
  validatorsVote: false,
  duration: 432000, // 5 days
  durationValidators: 432000, // 5 days
  quorum: PRECISION.times("5").toFixed(), // 5%
  quorumValidators: PRECISION.times("51").toFixed(), // 51%
  minVotesForVoting: wei("13"), // 13 votes
  minVotesForCreating: wei("10000"), // 10000 votes
  executionDelay: 1800, // 30 mins
  rewardsInfo: {
    rewardToken: ZERO_ADDR,
    creationReward: 0,
    executionReward: 0,
    voteRewardsCoefficient: 0,
  },
  executorDescription: "tokensale-proposal",
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
