// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPool.sol";

interface IInvestTraderPool {
    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) external;
}
