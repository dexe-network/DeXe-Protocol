// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/ICoreProperties.sol";

interface ITraderPoolFactory {
    struct PoolDeployParameters {
        string descriptionURL;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }
}
