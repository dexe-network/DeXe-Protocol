// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@spherex-xyz/contracts/src/ProtectedProxies/SphereXUpgradeableBeacon.sol";

contract PoolBeacon is SphereXUpgradeableBeacon {
    constructor(
        address sphereXAdmin,
        address sphereXOperator,
        address sphereXEngine,
        address implementation
    ) SphereXUpgradeableBeacon(implementation, sphereXAdmin, sphereXOperator, sphereXEngine) {}

    function upgrade(address newImplementation) external {
        upgradeTo(newImplementation);
    }
}
