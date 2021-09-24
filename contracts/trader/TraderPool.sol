// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

abstract contract TraderPool is ITraderPool, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}
}
