// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IRiskyTraderPool.sol";

interface IInvestTraderPool is IRiskyTraderPool {
    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) external;
}
