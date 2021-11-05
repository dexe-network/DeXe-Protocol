// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IBasicTraderPool.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) public override {
        TraderPool.__TraderPool_init(name, symbol, _poolParameters);
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) public override onlyTraderAdmin {
        require(_priceFeed.isSupportedBaseToken(to), "BTP: invalid exchange");

        super.exchange(from, to, amount);
    }
}
