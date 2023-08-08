const { PRECISION, SECONDS_IN_DAY, SECONDS_IN_MONTH, DECIMAL } = require("../../scripts/utils/constants");

const ExchangeType = {
  FROM_EXACT: 0,
  TO_EXACT: 1,
};

const ExecutorType = {
  DEFAULT: 0,
  INTERNAL: 1,
  DISTRIBUTION: 2,
  VALIDATORS: 3,
};

const ComissionPeriods = {
  PERIOD_1: 0,
  PERIOD_2: 1,
  PERIOD_3: 2,
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

const ValidatorsProposalState = {
  Voting: 0,
  Defeated: 1,
  Succeeded: 2,
  Locked: 3,
  Executed: 4,
  Undefined: 5,
};

const ProposalType = {
  ChangeInternalDurationAndExecutionDelayAndQuorum: 0,
  ChangeBalances: 1,
};

const ParticipationType = {
  DAOVotes: "0",
  Whitelist: "1",
  BABT: "2",
  TokenLock: "3",
  NftLock: "4",
};

const DEFAULT_CORE_PROPERTIES = {
  traderParams: {
    maxPoolInvestors: 1000,
    maxOpenPositions: 25,
    leverageThreshold: 2500,
    leverageSlope: 5,
    commissionInitTimestamp: 0,
    commissionDurations: [SECONDS_IN_MONTH, SECONDS_IN_MONTH * 3, SECONDS_IN_MONTH * 12],
    dexeCommissionPercentage: PRECISION.times(30).toFixed(),
    dexeCommissionDistributionPercentages: [
      PRECISION.times(33).toFixed(),
      PRECISION.times(33).toFixed(),
      PRECISION.times(33).toFixed(),
    ],
    minTraderCommission: PRECISION.times(20).toFixed(),
    maxTraderCommissions: [PRECISION.times(30).toFixed(), PRECISION.times(50).toFixed(), PRECISION.times(70).toFixed()],
    delayForRiskyPool: SECONDS_IN_DAY * 20,
  },
  insuranceParams: {
    insuranceFactor: 10,
    maxInsurancePoolShare: PRECISION.times(33.3333).toFixed(),
    minInsuranceDeposit: DECIMAL.times(10).toFixed(),
    insuranceWithdrawalLock: SECONDS_IN_DAY,
  },
  govParams: {
    govVotesLimit: 20,
    govCommissionPercentage: PRECISION.times(20).toFixed(),
  },
};

module.exports = {
  ExchangeType,
  ExecutorType,
  ComissionPeriods,
  ProposalState,
  ProposalType,
  ValidatorsProposalState,
  ParticipationType,
  DEFAULT_CORE_PROPERTIES,
};
