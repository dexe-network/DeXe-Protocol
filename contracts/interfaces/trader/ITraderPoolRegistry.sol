// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the TraderPoolRegistry contract, a tuned ContractsRegistry contract. Its purpose is the management of
 * TraderPools + proposal pools. The owner of this contract is capable of upgrading TraderPools'
 * implementation via the ProxyBeacon pattern
 */
interface ITraderPoolRegistry {
    /// @notice This function injects dependencies (adds required contracts) to the specified pools
    /// @param name the type of the contract to inject dependencies into
    /// @param offset the starting index of the contracts array
    /// @param limit the length of observed contracts array
    function injectDependenciesToExistingPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external;

    /// @notice The function that sets new implmentations of the pools (aka upgrades the pools)
    /// @param names the types of the pools to upgrade
    /// @param newImplementations new implementations of the specified pools
    function setNewImplementations(string[] calldata names, address[] calldata newImplementations)
        external;

    /// @notice The function that returns the implementation contract of a specific contract type
    /// @param name the contract type
    /// @return the implmementation address
    function getImplementation(string calldata name) external view returns (address);

    /// @notice The function that returns the proxy beacon of a specific contract type
    /// @param name the contract type
    /// @return the address of the proxy beacon
    function getProxyBeacon(string calldata name) external view returns (address);

    /// @notice The function to add new pool to the registry (called by the TraderPoolFactory)
    /// @param user the trader of the pool
    /// @param name the type of the pool
    /// @param poolAddress the address of the new pool
    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    /// @notice The function that counts the pools by their type
    /// @param name the type of the pool
    /// @return the total number of pools with the specified type
    function countPools(string calldata name) external view returns (uint256);

    /// @notice The function that counts the pools by their type
    /// @param name the type of the pool
    /// @return the total number of pools with the specified type
    function countUserPools(address user, string calldata name) external view returns (uint256);

    /// @notice The function that lists the pools by the provided type
    /// @param name the type of the pool
    /// @param offset the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    function listPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    /// @notice The function that lists user pools by the provided type and user
    /// @param user the trader
    /// @param name the type of the pool
    /// @param offset the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    function listUserPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    function isPool(address potentialPool) external view returns (bool);
}
