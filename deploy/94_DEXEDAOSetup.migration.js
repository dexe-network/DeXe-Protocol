const config = require("./config/config.json");

const { ZERO_ADDR, PRECISION } = require("../scripts/utils/constants");
const { wei } = require("../scripts/utils/utils");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolFactory = artifacts.require("PoolFactory");

let POOL_PARAMETERS = {
  settingsParams: {
    proposalSettings: [
      {
        earlyCompletion: true,
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
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
        },
        executorDescription: "default",
      },
      {
        earlyCompletion: true,
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
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
        },
        executorDescription: "internal",
      },
      {
        earlyCompletion: false,
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
          voteForRewardsCoefficient: PRECISION.times("10").toFixed(),
          voteAgainstRewardsCoefficient: PRECISION.times("10").toFixed(),
        },
        executorDescription: "dp",
      },
      {
        earlyCompletion: true,
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
          voteForRewardsCoefficient: 0,
          voteAgainstRewardsCoefficient: 0,
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
    totalPowerInTokens: 0,
    nftsTotalSupply: 0,
  },
  nftMultiplierAddress: ZERO_ADDR,
  verifier: ZERO_ADDR,
  onlyBABTHolders: false,
  descriptionURL: "",
  name: config.DEXEDAO.name,
};

async function setupInsuranceProposals(contractsRegistry) {
  POOL_PARAMETERS.settingsParams.proposalSettings.push({
    earlyCompletion: true,
    delegatedVotingAllowed: true,
    validatorsVote: true,
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
      voteForRewardsCoefficient: 0,
      voteAgainstRewardsCoefficient: 0,
    },
    executorDescription: "insurance",
  });
  POOL_PARAMETERS.settingsParams.additionalProposalExecutors.push(await contractsRegistry.getInsuranceContract());
}

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());

  await setupInsuranceProposals(contractsRegistry);

  let tx = await poolFactory.deployGovPool(POOL_PARAMETERS);

  const dexeDaoAddress = tx.receipt.logs[0].args.govPool;

  deployer.dexeDaoAddress = dexeDaoAddress;

  logger.logTransaction(tx, "Deployed DEXE DAO");

  logger.logContracts(["DEXE DAO", dexeDaoAddress]);
};
