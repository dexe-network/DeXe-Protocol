// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../trader/TraderPool.sol";

contract TraderPoolMock is TraderPool {
    using EnumerableSet for EnumerableSet.AddressSet;

    function getMaxTraderLeverage(
        uint256 traderUSD,
        uint256 threshold,
        uint256 slope
    ) public pure returns (uint256 maxTraderLeverage) {
        return TraderPoolHelper.getMaxTraderLeverage(traderUSD, threshold, slope);
    }

    function proposalPoolAddress() external pure override returns (address) {
        return address(0);
    }

    function totalEmission() public view override returns (uint256) {
        return totalSupply();
    }

    function openPositions() external view returns (address[] memory) {
        return _openPositions.values();
    }
}
