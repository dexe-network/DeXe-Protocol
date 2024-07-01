const { ZERO_ADDR, PRECISION } = require("../../../scripts/utils/constants.js");
const { wei } = require("../../../scripts/utils/utils.js");

const { getBytesPolynomialPowerInit } = require("../utils.js");

const owners = ["0xEd498E75d471C3b874461a87Bb7146453CC8175A", "0xCa543e570e4A1F6DA7cf9C4C7211692Bc105a00A"];

const tokens = {
  DEXE: "0xf42F27612af98F40865Dc3CB8531d3aa4C44A8E5",
  BUSD: "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7",
  USDT: "0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684",
  BABT: "0x8ca8a45c53e40bb42b8f5806fc3de00490d789f6",
  WBNB: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
};

const uniswap = {
  router: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
  quoter: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2",
};

const NETWORK_PROPERTIES_CONTRACT_NAME = "BSCProperties";

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
  NETWORK_PROPERTIES_CONTRACT_NAME,
  DEXE_DAO_NAME,
  DOCUMENT_HASH,
  DEFAULT_CORE_PROPERTIES,
  DEFAULT_POOL_TYPES,
  POOL_PARAMETERS,
  DP_SETTINGS,
  TOKENSALE_SETTINGS,
};
