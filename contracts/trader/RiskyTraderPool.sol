// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/trader/IRiskyTraderPool.sol";

import "./TraderPool.sol";

contract RiskyTraderPool is IRiskyTraderPool, TraderPool {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 internal _firstInvest;

    function __RiskyTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) public override {
        TraderPool.__TraderPool_init(name, symbol, _poolParameters);
    }

    function invest(uint256 amountInBaseToInvest) public override {
        if (TraderPool._openPositions.length() == 0) {
            _firstInvest = block.timestamp;
        } else {
            require(
                traderAdmins[_msgSender()] || _firstInvest + 20 days <= block.timestamp,
                "RiskyTraderPool: wait 20 days after first invest"
            );
        }
        super.invest(amountInBaseToInvest);
    }
}
