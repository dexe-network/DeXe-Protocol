const { PRECISION } = require("../../scripts/utils/constants");

const ExecutorType = {
  DEFAULT: 0,
  INTERNAL: 1,
  VALIDATORS: 2,
};

const ProposalState = {
  Voting: 0,
  WaitingForVotingTransfer: 1,
  ValidatorVoting: 2,
  Defeated: 3,
  SucceededFor: 4,
  SucceededAgainst: 5,
  Locked: 6,
  ExecutedFor: 7,
  ExecutedAgainst: 8,
  Undefined: 9,
};

const VoteType = {
  PersonalVote: 0,
  MicropoolVote: 1,
  DelegatedVote: 2,
  TreasuryVote: 3,
};

const ValidatorsProposalState = {
  Voting: 0,
  Defeated: 1,
  Succeeded: 2,
  Locked: 3,
  Executed: 4,
  Undefined: 5,
};

const ProposalType = {
  ChangeSettings: 0,
  ChangeBalances: 1,
  MonthlyWithdraw: 2,
  OffchainProposal: 3,
};

const ParticipationType = {
  NoWhitelist: "0",
  DAOVotes: "1",
  Whitelist: "2",
  BABT: "3",
  TokenLock: "4",
  NftLock: "5",
};

const DEFAULT_CORE_PROPERTIES = {
  govVotesLimit: 20,
  govCommissionPercentage: PRECISION.times(20).toFixed(),
  tokenSaleProposalCommissionPercentage: PRECISION.toFixed(),
  micropoolVoteRewardsPercentage: PRECISION.times(20).toFixed(),
  treasuryVoteRewardsPercentage: PRECISION.times(1.618).toFixed(),
};

module.exports = {
  ExecutorType,
  ProposalState,
  ProposalType,
  VoteType,
  ValidatorsProposalState,
  ParticipationType,
  DEFAULT_CORE_PROPERTIES,
};
