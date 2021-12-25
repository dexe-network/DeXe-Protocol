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
        uint256 insuranceFactor;
        uint256 maxInsurancePoolShare;
    }

    function setCoreParameters(CoreParameters calldata _coreParameters) external;

    function setMaximumPoolInvestors(uint256 count) external;

    function setMaximumOpenPositions(uint256 count) external;

    function setTraderLeverageParams(uint256 threshold, uint256 slope) external;

    function setCommissionInitTimestamp(uint256 timestamp) external;

    function setCommissionDurations(uint256[] calldata durations) external;

    function setDEXECommissionPercentages(
        uint256 dexeCommission,
        uint256[] calldata distributionPercentages
    ) external;

    function setInsuranceParameters(uint256 insuranceFactor, uint256 maxInsurancePoolShare)
        external;

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
        returns (
            uint256 totalPercentage,
            uint256[] memory individualPercentages,
            address[3] memory commissionReceivers
        );

    function getTraderCommissions() external view returns (uint256, uint256[] memory);

    function getDelayForRiskyPool() external view returns (uint256);

    function getInsuranceFactor() external view returns (uint256);

    function getMaxInsurancePoolShare() external view returns (uint256);

    function getCommissionEpoch(uint256 timestamp, CommissionPeriod commissionPeriod)
        external
        view
        returns (uint256);
}
