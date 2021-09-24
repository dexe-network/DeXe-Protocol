// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/insurance/IInsuranceVoting.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

contract InsuranceVoting is IInsuranceVoting, AbstractDependant {
    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {}
}
