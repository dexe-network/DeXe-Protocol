const { ZERO_ADDR, PRECISION } = require("../../../scripts/utils/constants.js");
const { wei } = require("../../../scripts/utils/utils.js");

const { getBytesPolynomialPowerInit } = require("../utils.js");

const owners = ["0x04130F8679394e3A8d55568F2189c3F3BF48ecbb"];

const tokens = {
  DEXE: "0xde4EE8057785A7e8e800Db58F9784845A5C2Cbd6",
  BUSD: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  BABT: "0x0000000000000000000000000000000000000000",
  WBNB: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
};

const uniswap = {
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
};

const NETWORK_PROPERTIES_CONTRACT_NAME = "ETHProperties";

const DEXE_DAO_NAME = "DeXe Protocol";

const DOCUMENT_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const DEFAULT_CORE_PROPERTIES = {
  govVotesLimit: 50,
  govCommissionPercentage: PRECISION.times(30).toFixed(),
  tokenSaleProposalCommissionPercentage: PRECISION.toFixed(),
  micropoolVoteRewardsPercentage: PRECISION.times(20).toFixed(),
  treasuryVoteRewardsPercentage: PRECISION.times(1.618).toFixed(),
};

const DEFAULT_POOL_TYPES = [
  ["0", uniswap.router, "0"],
  ["1", uniswap.quoter, "100"],
  ["1", uniswap.quoter, "500"],
  ["1", uniswap.quoter, "3000"],
  ["1", uniswap.quoter, "10000"],
];

const POOL_PARAMETERS = {
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
    tokenAddress: tokens.DEXE,
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
  name: DEXE_DAO_NAME,
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

module.exports = {
  owners,
  tokens,
  uniswap,
  NETWORK_PROPERTIES_CONTRACT_NAME,
  DEXE_DAO_NAME,
  DOCUMENT_HASH,
  DEFAULT_CORE_PROPERTIES,
  DEFAULT_POOL_TYPES,
  POOL_PARAMETERS,
  DP_SETTINGS,
  TOKENSALE_SETTINGS,
};
