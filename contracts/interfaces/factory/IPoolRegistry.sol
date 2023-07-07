// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../trader/ITraderPool.sol";

/**
 * This is the PoolRegistry contract, a tuned ContractsRegistry contract. Its purpose is the management of
 * TraderPools, proposal pools, GovPools and contracts related to GovPools.
 * The owner of this contract is capable of upgrading pools' implementation via the ProxyBeacon pattern
 */
interface IPoolRegistry {
    /// @notice The function to add the pool proxy to the registry (called by the PoolFactory)
    /// @param name the type of the pool
    /// @param poolAddress the address of the pool to add
    function addProxyPool(string calldata name, address poolAddress) external;

    /// @notice The function to associate an owner with the pool (called by the PoolFactory)
    /// @param user the trader of the pool
    /// @param name the type of the pool
    /// @param poolAddress the address of the new pool
    function associateUserWithPool(
        address user,
        string calldata name,
        address poolAddress
    ) external;

    /// @notice The function to get the name of the basic pool
    /// @return the name of the basic pool
    function BASIC_POOL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the invest pool
    /// @return the name of the invest pool
    function INVEST_POOL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the risky proposal pool
    /// @return the name of the risky proposal pool
    function RISKY_PROPOSAL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the invest proposal pool
    /// @return the name of the invest proposal pool
    function INVEST_PROPOSAL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the gov pool
    /// @return the name of the gov pool
    function GOV_POOL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the settings contract
    /// @return the name of the settings contract
    function SETTINGS_NAME() external view returns (string memory);

    /// @notice The function to get the name of the validators contract
    /// @return the name of the validators contract
    function VALIDATORS_NAME() external view returns (string memory);

    /// @notice The function to get the name of the user keeper contract
    /// @return the name of the user keeper contract
    function USER_KEEPER_NAME() external view returns (string memory);

    /// @notice The function to get the name of the distribution proposal pool
    /// @return the name of the distribution proposal pool
    function DISTRIBUTION_PROPOSAL_NAME() external view returns (string memory);

    /// @notice The function to get the name of the token sale proposal pool
    /// @return the name of the token sale proposal pool
    function TOKEN_SALE_PROPOSAL_NAME() external view returns (string memory);

    /// @notice The function that counts associated pools by their type
    /// @param user the owner of the pool
    /// @param name the type of the pool
    /// @return the total number of pools with the specified type
    function countAssociatedPools(
        address user,
        string calldata name
    ) external view returns (uint256);

    /// @notice The function that lists associated pools by the provided type and user
    /// @param user the trader
    /// @param name the type of the pool
    /// @param offset the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    function listAssociatedPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools);

    /// @notice The function that lists trader pools with their static info
    /// @param name the type of the pool
    /// @param offset the the starting index of the pools array
    /// @param limit the length of the observed pools array
    /// @return pools the addresses of the pools
    /// @return poolInfos the array of static information per pool
    /// @return leverageInfos the array of trader leverage information per pool
    function listTraderPoolsWithInfo(
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
    function isTraderPool(address potentialPool) external view returns (bool);

    /// @notice The function to check if the given address is a valid GovPool
    /// @param potentialPool the address to inspect
    /// @return true if the address is a GovPool, false otherwise
    function isGovPool(address potentialPool) external view returns (bool);
}
