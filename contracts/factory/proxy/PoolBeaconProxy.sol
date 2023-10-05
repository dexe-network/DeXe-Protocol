// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@spherex-dexe/contracts/ProtectedProxies/ProtectedBeaconProxy.sol";

contract PoolBeaconProxy is ProtectedBeaconProxy {
    constructor(address beacon, bytes memory data) payable ProtectedBeaconProxy(beacon, data) {}

    function implementation() external view virtual returns (address) {
        return _implementation();
    }
}
