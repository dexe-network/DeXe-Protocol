// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPool.sol";

/**
 * This is the TraderPoolRegistry contract, a tuned ContractsRegistry contract. Its purpose is the management of
 * TraderPools + proposal pools. The owner of this contract is capable of upgrading TraderPools'
 * implementation via the ProxyBeacon pattern
 */
interface ITraderPoolRegistry {
    /// @notice The function to add new pool to the registry (called by the PoolFactory)
    /// @param user the trader of the pool
    /// @param name the type of the pool
    /// @param poolAddress the address of the new pool
    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    /// @notice The function that counts trader's pools by their type
    /// @param user the owner of the pool
    /// @param name the type of the pool
    /// @return the total number of pools with the specified type
    function countTraderPools(address user, string calldata name) external view returns (uint256);

    /// @notice The function that lists trader pools by the provided type and user
    /// @param user the trader
    /// @param name the type of the pool
    /// @param offset the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    function listTraderPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    /// @notice The function that lists the pools with their static info
    /// @param name the type of the pool
    /// @param offset the the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    /// @return poolInfos the array of static information per pool
    /// @return leverageInfos the array of trader leverage information per pool
    function listPoolsWithInfo(
        string calldata name,
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            address[] memory pools,
            ITraderPool.PoolInfo[] memory poolInfos,
            ITraderPool.LeverageInfo[] memory leverageInfos
        );

    /// @notice The function to check if the given address is a valid BasicTraderPool
    /// @param potentialPool the address to inspect
    /// @return true if the address is a BasicTraderPool, false otherwise
    function isBasicPool(address potentialPool) external view returns (bool);

    /// @notice The function to check if the given address is a valid InvestTraderPool
    /// @param potentialPool the address to inspect
    /// @return true if the address is an InvestTraderPool, false otherwise
    function isInvestPool(address potentialPool) external view returns (bool);

    /// @notice The function to check if the given address is a valid TraderPool
    /// @param potentialPool the address to inspect
    /// @return true if the address is a TraderPool, false otherwise
    function isPool(address potentialPool) external view returns (bool);
}
