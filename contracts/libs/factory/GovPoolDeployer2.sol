// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Create2.sol";

import "../../gov/GovPool.sol";

library GovPoolDeployer2 {
    function predictDeploy2Address(
        address deployer,
        string memory poolName,
        bytes32 bytecodeHash
    ) external view returns (address) {
        return Create2.computeAddress(calculateSalt(deployer, poolName), bytecodeHash);
    }

    function calculateSalt(
        address deployer,
        string memory poolName
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, poolName));
    }
}
