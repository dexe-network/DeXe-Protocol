const { ZERO_ADDR, PRECISION } = require("../../../scripts/utils/constants.js");
const { wei } = require("../../../scripts/utils/utils.js");

const { getBytesPolynomialPowerInit } = require("../utils.js");

const owners = ["0x04130F8679394e3A8d55568F2189c3F3BF48ecbb"];

const tokens = {
  DEXE: "0x6E88056E8376AE7709496BA64D37FA2F8015CE3E",
  BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  BABT: "0x2B09d47D550061f995A3b5C6F0Fd58005215D7c8",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
};

const uniswap = {
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  quoter: "0xb048bbc1ee6b733fffcfb9e9cef7375518e25997",
};

const NETWORK_PROPERTIES = "0xf1a47B630649a87ac521b13D3647cD72050d15c6";

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
  ["1", uniswap.quoter, "2500"],
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
  NETWORK_PROPERTIES,
  DEXE_DAO_NAME,
  DOCUMENT_HASH,
  DEFAULT_CORE_PROPERTIES,
  DEFAULT_POOL_TYPES,
  POOL_PARAMETERS,
  DP_SETTINGS,
  TOKENSALE_SETTINGS,
};
