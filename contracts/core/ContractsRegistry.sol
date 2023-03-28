// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@dlsl/dev-modules/contracts-registry/presets/OwnableContractsRegistry.sol";

import "../interfaces/core/IContractsRegistry.sol";

contract ContractsRegistry is IContractsRegistry, OwnableContractsRegistry, UUPSUpgradeable {
    string public constant USER_REGISTRY_NAME = "USER_REGISTRY";

    string public constant POOL_FACTORY_NAME = "POOL_FACTORY";
    string public constant POOL_REGISTRY_NAME = "POOL_REGISTRY";

    string public constant DEXE_NAME = "DEXE";
    string public constant USD_NAME = "USD";
    string public constant BABT_NAME = "BABT";

    string public constant PRICE_FEED_NAME = "PRICE_FEED";
    string public constant UNISWAP_V2_ROUTER_NAME = "UNISWAP_V2_ROUTER";
    string public constant UNISWAP_V2_FACTORY_NAME = "UNISWAP_V2_FACTORY";

    string public constant INSURANCE_NAME = "INSURANCE";
    string public constant TREASURY_NAME = "TREASURY";
    string public constant DIVIDENDS_NAME = "DIVIDENDS";

    string public constant CORE_PROPERTIES_NAME = "CORE_PROPERTIES";

    function getUserRegistryContract() external view override returns (address) {
        return getContract(USER_REGISTRY_NAME);
    }

    function getPoolFactoryContract() external view override returns (address) {
        return getContract(POOL_FACTORY_NAME);
    }

    function getPoolRegistryContract() external view override returns (address) {
        return getContract(POOL_REGISTRY_NAME);
    }

    function getDEXEContract() external view override returns (address) {
        return getContract(DEXE_NAME);
    }

    function getUSDContract() external view override returns (address) {
        return getContract(USD_NAME);
    }

    function getPriceFeedContract() external view override returns (address) {
        return getContract(PRICE_FEED_NAME);
    }

    function getUniswapV2RouterContract() external view override returns (address) {
        return getContract(UNISWAP_V2_ROUTER_NAME);
    }

    function getUniswapV2FactoryContract() external view override returns (address) {
        return getContract(UNISWAP_V2_FACTORY_NAME);
    }

    function getInsuranceContract() external view override returns (address) {
        return getContract(INSURANCE_NAME);
    }

    function getTreasuryContract() external view override returns (address) {
        return getContract(TREASURY_NAME);
    }

    function getDividendsContract() external view override returns (address) {
        return getContract(DIVIDENDS_NAME);
    }

    function getCorePropertiesContract() external view override returns (address) {
        return getContract(CORE_PROPERTIES_NAME);
    }

    function getBABTContract() external view override returns (address) {
        return getContract(BABT_NAME);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
