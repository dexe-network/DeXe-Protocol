# 🌌 CoreProperties

The purpose of this module is to store system constant parameters.

#### TraderParameters
`TraderParameters` struct stores `TraderPools` parameters.
```solidity
struct TraderParameters {
    uint256 maxPoolInvestors;
    uint256 maxOpenPositions;
    uint256 leverageThreshold;
    uint256 leverageSlope;
    uint256 commissionInitTimestamp;
    uint256[] commissionDurations;
    uint256 dexeCommissionPercentage;
    uint256[] dexeCommissionDistributionPercentages;
    uint256 minTraderCommission;
    uint256[] maxTraderCommissions;
    uint256 delayForRiskyPool;
}
```
 - ***maxPoolInvestors*** - the maximum number of investors in the `TraderPool`
 - ***maxOpenPositions*** - the maximum number of concurrently opened positions by a trader
 - ***leverageThreshold*** - the first parameter in the trader's formula
 - ***leverageSlope*** - the second parameters in the trader's formula
 - ***commissionInitTimestamp*** - the initial timestamp of the commission rounds
 - ***commissionDurations*** - the durations of the commission periods in seconds (see `CommissionPeriod`)
 - ***dexeCommissionPercentage*** - the protocol's commission percentage, multiplied by ***10\*\*25***
 - ***dexeCommissionDistributionPercentages*** - the individual percentages of the commission contracts (should sum up to ***10\*\*27*** = **100%**)
 - ***minTraderCommission*** - the minimal trader's commission the trader can specify
 - ***maxTraderCommissions*** - the maximal trader's commission the trader can specify based on the chosen commission period
 - ***delayForRiskyPool*** - the investment delay after the first exchange in the risky pool in seconds

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
    uint256 insuranceFactor;
    uint256 maxInsurancePoolShare;
    uint256 minInsuranceDeposit;
    uint256 insuranceWithdrawalLock;
}
```
 - ***insuranceFactor*** - the deposit insurance multiplier. Means how many insurance tokens is received per deposited token
 - ***maxInsurancePoolShare*** - the maximal share of the pool which can be used to pay out the insurance (**3** **->** *1/3* of the pool)
 - ***minInsuranceDeposit*** - the minimal required deposit in **DEXE** tokens to receive an insurance
 - ***insuranceWithdrawalLock*** - the time needed to wait to withdraw tokens from the insurance after the deposit

 #### GovParameters
 `GovParameters` struct stores `GovPool` parameters.
 ```solidity
struct GovParameters {
    uint256 govVotesLimit;
    uint256 govCommissionPercentage;
}
```
- ***govVotesLimit*** - the maximum number of simultaneous votes of the voter
- ***govCommission*** - the protocol's commission percentage

#### CoreParameters
 `CoreParameters` struct stores vital platform's parameters that may be modified by the **OWNER**.
 ```solidity
struct CoreParameters {
    TraderParameters traderParams;
    InsuranceParameters insuranceParams;
    GovParameters govParams;
}
 ```