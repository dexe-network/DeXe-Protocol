// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPoolRegistry {
    function getImplementation(string calldata name) external view returns (address);

    function getProxyBeacon(string calldata name) external view returns (address);

    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    function countPools(string calldata name) external view returns (uint256);

    function countUserPools(address user, string calldata name) external view returns (uint256);

    function listPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    function listUserPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    function isPool(address potentialPool) external view returns (bool);
}
