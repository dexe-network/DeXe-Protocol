// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/dex/IDEXAbstraction.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

contract DEXAbstraction is IDEXAbstraction, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external override returns (uint256) {
        return 0;
    }
}
