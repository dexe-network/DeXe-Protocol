# 🌌 CoreProperties

The purpose of this module is to store system constant parameters.

#### TraderParameters

`TraderParameters` struct stores `TraderPools` parameters.

```solidity
struct TraderParameters {
    uint64 maxPoolInvestors;
    uint64 maxOpenPositions;
    uint64 delayForRiskyPool;
    uint64 commissionInitTimestamp;
    uint64[] commissionDurations;
    uint32 leverageThreshold;
    uint32 leverageSlope;
    uint128 dexeCommissionPercentage;
    uint128[] dexeCommissionDistributionPercentages;
    uint256 minTraderCommission;
    uint256[] maxTraderCommissions;
}
```

- ***maxPoolInvestors*** - the maximum number of investors in the `TraderPool`
- ***maxOpenPositions*** - the maximum number of concurrently opened positions by a trader
- ***delayForRiskyPool*** - the investment delay after the first exchange in the risky pool in seconds
- ***commissionInitTimestamp*** - the initial timestamp of the commission rounds
- ***commissionDurations*** - the durations of the commission periods in seconds (see `CommissionPeriod`)
- ***leverageThreshold*** - the first parameter in the trader's formula
- ***leverageSlope*** - the second parameters in the trader's formula
- ***dexeCommissionPercentage*** - the protocol's commission percentage, multiplied by ***10\*\*25***
- ***dexeCommissionDistributionPercentages*** - the individual percentages of the commission contracts (should sum up to ***10\*\*27*** = **100%**)
- ***minTraderCommission*** - the minimal trader's commission the trader can specify
- ***maxTraderCommissions*** - the maximal trader's commission the trader can specify based on the chosen commission period

⚠️⚠️ The **DeXe DAO** could change commissions at ***any period of time***. The upper bound limit for the commission is **NOT** set up.

There are **3** types of commission periods.

 ```solidity
enum CommissionPeriod {
    PERIOD_1,
    PERIOD_2,
    PERIOD_3
}
```

#### InsuranceParameters

`InsuranceParameters` struct stores `Insurance` parameters.

```solidity
struct InsuranceParameters {
    uint64 insuranceFactor;
    uint64 insuranceWithdrawalLock;
    uint128 maxInsurancePoolShare;
    uint256 minInsuranceDeposit;
}
```

- ***insuranceFactor*** - the deposit insurance multiplier. Means how many insurance tokens is received per deposited token
- ***insuranceWithdrawalLock*** - the time needed to wait to withdraw tokens from the insurance after the deposit
- ***minInsuranceDeposit*** - the minimal required deposit in **DEXE** tokens to receive an insurance
- ***maxInsurancePoolShare*** - the maximal share of the pool which can be used to pay out the insurance (**3** **->** *1/3* of the pool)

#### GovParameters

 `GovParameters` struct stores `GovPool` parameters.

 ```solidity
struct GovParameters {
    uint128 govVotesLimit;
    uint128 govCommissionPercentage;
    uint256 tokenSaleProposalCommissionPercentage;
    uint128 micropoolVoteRewardsPercentage;
    uint128 treasuryVoteRewardsPercentage;
}
```

- ***govVotesLimit*** - the maximum number of simultaneous votes of the voter
- ***govCommission*** - the protocol's commission percentage
- ***tokenSaleProposalCommissionPercentage*** - the commission percentage for the token sale proposal
- ***micropoolVoteRewardsPercentage*** - the percentage of the reward for the micropool vote
- ***treasuryVoteRewardsPercentage*** - the percentage of the reward for the treasury vote

#### CoreParameters

 `CoreParameters` struct stores vital platform's parameters that may be modified by the **OWNER**.

 ```solidity
struct CoreParameters {
    TraderParameters traderParams;
    InsuranceParameters insuranceParams;
    GovParameters govParams;
}
 ```
