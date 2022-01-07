// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the registry contract of DEXE platform that stores information about
 * the other contracts used by the protocol. Its purpose is to keep track of the propotol's
 * contracts, provide upgradibility mechanism and dependency injection mechanism.
 */
interface IContractsRegistry {
    /// @notice Used in dependency injection mechanism
    /// @return UserRegistry contract address
    function getUserRegistryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return TraderPoolFactory contract address
    function getTraderPoolFactoryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return TraderPoolRegistry contract address
    function getTraderPoolRegistryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return DEXE token contract address
    function getDEXEContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return Platform's native USD token contract address. This may be USDT/BUSD/USDC/DAI/FEI
    function getUSDContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return PriceFeed contract address
    function getPriceFeedContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return UniswapV2Router contract address. This can be any forked contract as well
    function getUniswapV2RouterContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return UniswapV2Factory contract address. This can be any forked contract as well
    function getUniswapV2FactoryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return Insurance contract address
    function getInsuranceContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return Treasury contract/wallet address
    function getTreasuryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return Dividends contract/wallet address
    function getDividendsContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return CoreProperties contract address
    function getCorePropertiesContract() external view returns (address);

    /// @notice Utility function that is used to fetch the contract address by its name
    /// @param name the name of the contract
    /// @return Contract's address by its name
    function getContract(string memory name) external view returns (address);

    /// @notice Utility function to check if the given contract was added to the registry
    /// @param name the name of the contract
    /// @return true if the contract was added, false otherwise
    function hasContract(string calldata name) external view returns (bool);

    /// @notice Utility function that is used to inject dependencies into the specified contract
    /// @param name the name of the contract
    function injectDependencies(string calldata name) external;

    /// @notice The function to fetch the upgrader contract. The upgrader contract is needed to overcome
    /// TransparentUpgreadableProxy's admin previliges and be able to inject dependencies
    /// @return The upgrader's address
    function getProxyUpgrader() external view returns (address);

    /// @notice The function to fetch the implementation of the given proxy contract
    /// @param name the name of the existing proxy contract
    /// @return The address of the implementation to proxy points to
    function getImplementation(string calldata name) external view returns (address);

    /// @notice The function to upgrade the implementation of the existing proxy contract
    /// @param name the name of the proxy contract to be upgraded
    /// @param newImplementation the new implementation address
    function upgradeContract(string calldata name, address newImplementation) external;

    /// @notice The function to upgrade the implemetation of the existing proxy contract with a function call
    /// @param name the name of the proxy to be upgraded
    /// @param newImplementation the new implmenetation address
    /// @param functionSignature the signature of the function to be called. \
    /// Only the functions with no parameters are supported. Ex: "upgradeV3()"
    function upgradeContractAndCall(
        string calldata name,
        address newImplementation,
        string calldata functionSignature
    ) external;

    /// @notice The function to add new (non-proxy) contract to the registry
    /// @param name the assigned name to the contract
    /// @param contractAddress the address of the contract to be added
    function addContract(string calldata name, address contractAddress) external;

    /// @notice The function to add new (non-proxy) contract to the registry automatically deploying a
    /// TransparentUpgradeableProxy with <contractAddress> as a destination. This will enable the upgreadibility mechanism
    /// @param name the assigned name to the contract
    /// @param contractAddress the implementation contract that will be used as a proxy's destination
    function addProxyContract(string calldata name, address contractAddress) external;

    /// @notice The function to add new (proxy) contract to the registry. This will enable the upgreadibility mechanism
    /// @param name the assigned name to the contract
    /// @param contractAddress the address of the proxy
    function justAddProxyContract(string calldata name, address contractAddress) external;

    /// @notice The function to delete the existing contract from the registry
    /// @param name the name of the contract to be deleted
    function deleteContract(string calldata name) external;
}
