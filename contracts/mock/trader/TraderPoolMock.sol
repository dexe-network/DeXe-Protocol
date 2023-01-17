// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../trader/TraderPool.sol";

contract TraderPoolMock is TraderPool {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TraderPoolLeverage for *;

    function __TraderPoolMock_init(
        string calldata name,
        string calldata symbol,
        PoolParameters calldata _poolParameters,
        bool _onlyBABTHolder
    ) public initializer {
        __TraderPool_init(name, symbol, _poolParameters, _onlyBABTHolder);
    }

    function proposalPoolAddress() external pure override returns (address) {
        return address(0);
    }

    function totalEmission() public view override returns (uint256) {
        return totalSupply();
    }

    function canRemovePrivateInvestor(address investor) public view override returns (bool) {
        return balanceOf(investor) == 0;
    }

    function isInvestor(address investor) external view returns (bool) {
        return _investors.contains(investor);
    }

    function getMaxTraderLeverage() public view returns (uint256 maxTraderLeverage) {
        (, maxTraderLeverage) = _poolParameters.getMaxTraderLeverage();
    }
}
