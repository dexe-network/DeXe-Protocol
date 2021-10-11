// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ICoreProperties {
    enum CommissionPeriod {
        MONTH_1,
        MONTH_3,
        MONTH_12
    }

    function getCommissionPeriod(CommissionPeriod period) external pure returns (uint256);

    function getBaseCommissionTimestamp() external view returns (uint256);

    /// @notice individualPercentages[0] - insurance commission
    /// @notice individualPercentages[1] - treasury commission
    /// @notice individualPercentages[2] - dividends commission
    function getDEXECommissionPercentages()
        external
        view
        returns (uint256 totalPercentage, uint256[] memory individualPercentages);
}
