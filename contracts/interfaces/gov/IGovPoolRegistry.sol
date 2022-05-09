// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovPoolRegistry {
    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    function countOwnerPools(address user, string calldata name) external view returns (uint256);

    function listOwnerPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);
}
