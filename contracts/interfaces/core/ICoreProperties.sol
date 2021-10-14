// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ICoreProperties {
    enum CommissionPeriod {
        MONTH_1,
        MONTH_3,
        MONTH_12
    }

    enum CommissionTypes {
        INSURANCE,
        TREASURY,
        DIVIDENDS
    }

    function getMaximumPoolInvestors() external view returns (uint256);

    function getMaximumOpenPositions() external view returns (uint256);

    function getTraderLeverageParams() external view returns (uint256 threshold, uint256 slope);

    function getCommissionPeriod(CommissionPeriod period) external view returns (uint256);

    function getBaseCommissionTimestamp() external view returns (uint256);

    /// @notice individualPercentages[INSURANCE] - insurance commission
    /// @notice individualPercentages[TREASURY] - treasury commission
    /// @notice individualPercentages[DIVIDENDS] - dividends commission
    function getDEXECommissionPercentages()
        external
        view
        returns (uint256 totalPercentage, uint256[] memory individualPercentages);
}
