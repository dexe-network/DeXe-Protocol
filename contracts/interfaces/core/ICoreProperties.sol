// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ICoreProperties {
    enum CommissionPeriod {
        PERIOD_1,
        PERIOD_2,
        PERIOD_3
    }

    enum CommissionTypes {
        INSURANCE,
        TREASURY,
        DIVIDENDS
    }

    struct CoreParameters {
        uint256 maximumPoolInvestors;
        uint256 maximumOpenPositions;
        uint256 leverageThreshold;
        uint256 leverageSlope;
        uint256 commissionInitTimestamp;
        uint256[] commissionDurations;
        uint256 dexeCommissionPercentage;
        uint256[] dexeCommissionDistributionPercentages;
        uint256 minimalTraderCommission;
        uint256[] maximalTraderCommissions;
        uint256 delayForRiskyPool;
    }

    function getMaximumPoolInvestors() external view returns (uint256);

    function getMaximumOpenPositions() external view returns (uint256);

    function getTraderLeverageParams() external view returns (uint256 threshold, uint256 slope);

    function getCommissionInitTimestamp() external view returns (uint256);

    function getCommissionDuration(CommissionPeriod period) external view returns (uint256);

    /// @notice individualPercentages[INSURANCE] - insurance commission
    /// @notice individualPercentages[TREASURY] - treasury commission
    /// @notice individualPercentages[DIVIDENDS] - dividends commission
    function getDEXECommissionPercentages()
        external
        view
        returns (uint256 totalPercentage, uint256[] memory individualPercentages);

    function getTraderCommissions() external view returns (uint256, uint256[] memory);

    function getDelayForRiskyPool() external view returns (uint256);
    
    function getNextCommissionEpoch(uint256 timestamp, CommissionPeriod commissionPeriod)
        external
        view
        returns (uint256);
}
