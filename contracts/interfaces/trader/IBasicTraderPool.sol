// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPool.sol";

interface IBasicTraderPool is ITraderPool {
    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) external;
}
