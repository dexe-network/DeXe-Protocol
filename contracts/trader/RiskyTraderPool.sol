// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/trader/IRiskyTraderPool.sol";
import "../interfaces/core/ICoreProperties.sol";

import "./TraderPool.sol";

contract RiskyTraderPool is IRiskyTraderPool, TraderPool {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 internal _firstExchange;

    function __RiskyTraderPool_init(
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
        if (_firstExchange == 0) {
            _firstExchange = block.timestamp;
        }
        super.exchange(from, to, amount);
    }

    function invest(uint256 amountInBaseToInvest) public override {
        require(
            traderAdmins[_msgSender()] ||
                (_firstExchange != 0 &&
                    _firstExchange + _coreProperties.getDelayForRiskyPool() <= block.timestamp),
            "RiskyTraderPool: wait a few days after first invest"
        );
        super.invest(amountInBaseToInvest);
    }
}
