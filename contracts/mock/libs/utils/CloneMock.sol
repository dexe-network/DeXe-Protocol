// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../../libs/factory/Clone.sol";

contract CloneMock {
    using Clone for *;

    function clone(address contractToClone) external returns (address cloned) {
        return contractToClone.clone();
    }

    function clone2(address contractToClone, bytes32 salt) external returns (address cloned) {
        return contractToClone.clone2(salt);
    }

    function predictClonedAddress(
        address contractToClone,
        bytes32 salt
    ) external view returns (address clonedAddress) {
        return contractToClone.predictClonedAddress(salt);
    }
}
