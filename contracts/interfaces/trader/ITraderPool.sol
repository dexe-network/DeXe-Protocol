// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/ICoreProperties.sol";

interface ITraderPool {
    struct PoolParameters {
        string description;
        bool activePortfolio;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 baseTokenDecimals;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }

    struct InvestorInfo {
        uint256 investedBase;
        uint256 commissionUnlockEpoch;
    }
}
