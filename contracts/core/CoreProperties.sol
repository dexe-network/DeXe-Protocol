// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "./Globals.sol";

contract CoreProperties is ICoreProperties, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}

    function getMaximumPoolInvestors() external view override returns (uint256) {
        return 0;
    }

    function getMaximumOpenPositions() external view override returns (uint256) {
        return 0;
    }

    function getTraderLeverageParams()
        external
        view
        override
        returns (uint256 threshold, uint256 slope)
    {
        threshold = 0;
        slope = 0;
    }

    function getCommissionPeriod(CommissionPeriod period)
        external
        pure
        override
        returns (uint256)
    {
        if (period == CommissionPeriod.MONTH_1) {
            return SECONDS_IN_MONTH;
        } else if (period == CommissionPeriod.MONTH_3) {
            return 3 * SECONDS_IN_MONTH;
        }

        return 12 * SECONDS_IN_MONTH;
    }

    function getBaseCommissionTimestamp() external view override returns (uint256) {
        return 0;
    }

    function getDEXECommissionPercentages()
        external
        view
        override
        returns (uint256 totalPercentage, uint256[] memory individualPercentages)
    {
        individualPercentages = new uint256[](3);
    }
}
