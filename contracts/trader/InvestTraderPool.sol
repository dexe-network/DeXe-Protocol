// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IInvestTraderPool.sol";

import "./RiskyTraderPool.sol";

contract InvestTraderPool is IInvestTraderPool, RiskyTraderPool {
    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) public override {}
}
