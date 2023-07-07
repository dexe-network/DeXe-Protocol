// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the registry contract of DEXE platform that stores information about
 * the other contracts used by the protocol. Its purpose is to keep track of the propotol's
 * contracts, provide upgradeability mechanism and dependency injection mechanism.
 */
interface IContractsRegistry {
    /// @notice Used in dependency injection mechanism
    /// @return UserRegistry contract name
    function USER_REGISTRY_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return PoolFactory contract name
    function POOL_FACTORY_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return PoolRegistry contract name
    function POOL_REGISTRY_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return DEXE token contract name
    function DEXE_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return Platform's native USD token contract name
    function USD_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return BABT token contract name
    function BABT_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return PriceFeed contract name
    function PRICE_FEED_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return UniswapV2Router contract name
    function UNISWAP_V2_ROUTER_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return UniswapV2Factory contract name
    function UNISWAP_V2_FACTORY_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return Insurance contract name
    function INSURANCE_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return Treasury contract name
    function TREASURY_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return Dividends contract name
    function DIVIDENDS_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return CoreProperties contract name
    function CORE_PROPERTIES_NAME() external view returns (string memory);

    /// @notice Used in dependency injection mechanism
    /// @return UserRegistry contract address
    function getUserRegistryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return PoolFactory contract address
    function getPoolFactoryContract() external view returns (address);

    /// @notice Used in dependency injection mechanism
    /// @return PoolRegistry contract address
    function getPoolRegistryContract() external view returns (address);

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

    /// @notice Used in dependency injection mechanism
    /// @return BABT contract address
    function getBABTContract() external view returns (address);
}
