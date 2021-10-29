// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IRiskyTraderPool.sol";

import "./TraderPool.sol";

contract RiskyTraderPool is IRiskyTraderPool, TraderPool {
    function __RiskyTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) public override {}
}
