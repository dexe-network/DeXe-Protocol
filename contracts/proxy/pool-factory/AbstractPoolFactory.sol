// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../contracts-registry/AbstractDependant.sol";
import "../pool-contracts-registry/AbstractPoolContractsRegistry.sol";
import "./PublicBeaconProxy.sol";

contract AbstractPoolFactory is AbstractDependant {
    address internal _contractsRegistry;

    function setDependencies(address contractsRegistry) public virtual override dependant {
        _contractsRegistry = contractsRegistry;
    }

    function _deploy(address poolRegistry, string memory poolType) internal returns (address) {
        return
            address(
                new PublicBeaconProxy(
                    AbstractPoolContractsRegistry(poolRegistry).getProxyBeacon(poolType),
                    ""
                )
            );
    }

    function _register(
        address poolRegistry,
        string memory poolType,
        address poolProxy
    ) internal {
        AbstractPoolContractsRegistry(poolRegistry).addPool(poolType, poolProxy);
    }

    function _injectDependencies(address poolRegistry, address proxy) internal {
        AbstractDependant(proxy).setDependencies(_contractsRegistry);
        AbstractDependant(proxy).setInjector(poolRegistry);
    }
}
