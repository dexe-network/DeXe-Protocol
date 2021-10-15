// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

contract PriceFeed is IPriceFeed, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}

    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) external view override returns (uint256) {
        return 0;
    }
}
