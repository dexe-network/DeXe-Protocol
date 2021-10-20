// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../trader/TraderPool.sol";

contract TraderPoolMock is TraderPool {
    using EnumerableSet for EnumerableSet.AddressSet;

    function getMaxTraderLeverage(
        uint256 traderDAI,
        uint256 threshold,
        uint256 slope
    ) public pure returns (uint256 maxTraderLeverage) {
        return TraderPoolHelper.getMaxTraderLeverage(traderDAI, threshold, slope);
    }

    function openPositions() external view returns (address[] memory) {
        return _openPositions.values();
    }
}
