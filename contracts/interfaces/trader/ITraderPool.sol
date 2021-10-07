// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPool {
    enum CommissionPeriod {
        MONTH_1,
        MONTH_3,
        MONTH_12
    }

    struct PoolParameters {
        string description;
        bool activePortfolio;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 minimalInvestment;
        CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }
}
