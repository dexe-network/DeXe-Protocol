// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/ITraderPoolFactory.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

contract TraderPoolFactory is ITraderPoolFactory, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}
}
