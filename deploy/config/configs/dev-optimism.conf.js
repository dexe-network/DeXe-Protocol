const { ZERO_ADDR, PRECISION } = require("../../../scripts/utils/constants.js");
const { wei } = require("../../../scripts/utils/utils.js");

const { getBytesPolynomialPowerInit } = require("../utils.js");

const owners = [
  "0xEd498E75d471C3b874461a87Bb7146453CC8175A",
  "0xCa543e570e4A1F6DA7cf9C4C7211692Bc105a00A",
  "0x4fBa1c7427197CdFB8Ad96711B0C838B4680E233",
];

const tokens = {
  DEXE: "0xEcE76f952ddb419d18B9EBBf8eaeD873adE46295",
  BUSD: "0x8Ab4781C79eec67dCE50899c869Da210631eD6e1",
  USDT: "0xaF179fb2Eb76019D487Af9ea3b717270C77B77E9",
  BABT: "0x0000000000000000000000000000000000000000",
  WBNB: "0x4200000000000000000000000000000000000006",
};

const uniswap = {
  router: "0x16e5dBEa4A25BD36bCB98Bd1d1B8554d681C3c22",
  quoter: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
};

const NETWORK_PROPERTIES = "0x372Cb8375F63444cD06F98f8f0b6073Be464D43C";

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
    symbol: "DEXEVT",
    proposalSettings: {
      duration: 600,
      executionDelay: 0,
      quorum: PRECISION.times("0.00001").toFixed(),
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
