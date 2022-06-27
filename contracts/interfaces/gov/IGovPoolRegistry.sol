// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is governance pools registry contract. The registry stores information about the deployed governance pools
 * and their owners. The owner of this contract is able to upgrade all the governance pools and the associated pools
 * with it via the BeaconProxy pattern
 */
interface IGovPoolRegistry {
    /// @notice The function to associate an owner with the pool (called by the PoolFactory)
    /// @param user the owner of the pool
    /// @param name the type of the pool
    /// @param poolAddress the address of the new pool
    function associateUserWithPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    /// @notice The function that counts owner's pools by their type
    /// @param user the owner of the pool
    /// @param name the type of the pool
    /// @return the total number of pools with the specified type
    function countOwnerPools(address user, string calldata name) external view returns (uint256);

    /// @notice The function that lists gov pools by the provided type and user
    /// @param user the owner
    /// @param name the type of the pool
    /// @param offset the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    function listOwnerPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);
}
