const { ZERO_ADDR, PRECISION } = require("../../../scripts/utils/constants.js");
const { wei } = require("../../../scripts/utils/utils.js");

const { getBytesPolynomialPowerInit } = require("../utils.js");

const owners = [
  "0xEd498E75d471C3b874461a87Bb7146453CC8175A",
  "0xCa543e570e4A1F6DA7cf9C4C7211692Bc105a00A",
  "0x4fBa1c7427197CdFB8Ad96711B0C838B4680E233",
];

const tokens = {
  DEXE: "0xEaFa082A394FAa5e32363376f3C88eeC1eAdb723",
  BUSD: "0x8C77ADBe1AC6c113e72A49b7b1077806F4a7b2B6",
  USDT: "0x2B0B2894A7003a2617f1C8322951D569Cc6b7cb7",
  BABT: "0x0000000000000000000000000000000000000000",
  WBNB: "0x360ad4f9a9a8efe9a8dcb5f461c4cc1047e1dcf9",
};

const uniswap = {
  router: "0x1221C672f39BDC15647F7B3E31EcAd249ABD4c49",
  quoter: "0x45878FFf4F23118805161e931FB39BA32416A3ba",
};

const NETWORK_PROPERTIES = "0x2A743C2b375942d345c6d0edA94EB87F3e424b83";

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
