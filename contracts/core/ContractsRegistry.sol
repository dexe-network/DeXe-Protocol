// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "../helpers/ProxyUpgrader.sol";

contract ContractsRegistry is IContractsRegistry, OwnableUpgradeable {
    ProxyUpgrader internal _proxyUpgrader;

    string public constant USER_REGISTRY_NAME = "USER_REGISTRY";

    string public constant TRADER_POOL_FACTORY_NAME = "TRADER_POOL_FACTORY";
    string public constant TRADER_POOL_REGISTRY_NAME = "TRADER_POOL_REGISTRY";

    string public constant DEXE_NAME = "DEXE";
    string public constant USD_NAME = "USD";

    string public constant PRICE_FEED_NAME = "PRICE_FEED";
    string public constant UNISWAP_V2_ROUTER_NAME = "UNISWAP_V2_ROUTER";
    string public constant UNISWAP_V2_FACTORY_NAME = "UNISWAP_V2_FACTORY";

    string public constant INSURANCE_NAME = "INSURANCE";
    string public constant TREASURY_NAME = "TREASURY";
    string public constant DIVIDENDS_NAME = "DIVIDENDS";

    string public constant CORE_PROPERTIES_NAME = "CORE_PROPERTIES";

    mapping(string => address) private _contracts;
    mapping(address => bool) private _isProxy;

    function __ContractsRegistry_init() external initializer {
        __Ownable_init();

        _proxyUpgrader = new ProxyUpgrader();
    }

    function getUserRegistryContract() external view override returns (address) {
        return getContract(USER_REGISTRY_NAME);
    }

    function getTraderPoolFactoryContract() external view override returns (address) {
        return getContract(TRADER_POOL_FACTORY_NAME);
    }

    function getTraderPoolRegistryContract() external view override returns (address) {
        return getContract(TRADER_POOL_REGISTRY_NAME);
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

    function getContract(string memory name) public view override returns (address) {
        address contractAddress = _contracts[name];

        require(contractAddress != address(0), "ContractsRegistry: This mapping doesn't exist");

        return contractAddress;
    }

    function hasContract(string calldata name) external view override returns (bool) {
        return _contracts[name] != address(0);
    }

    function injectDependencies(string calldata name) external override onlyOwner {
        address contractAddress = _contracts[name];

        require(contractAddress != address(0), "ContractsRegistry: This mapping doesn't exist");

        AbstractDependant dependant = AbstractDependant(contractAddress);
        dependant.setDependencies(this);
    }

    function getProxyUpgrader() external view override returns (address) {
        require(address(_proxyUpgrader) != address(0), "ContractsRegistry: Bad ProxyUpgrader");

        return address(_proxyUpgrader);
    }

    function getImplementation(string calldata name) external view override returns (address) {
        address contractProxy = _contracts[name];

        require(contractProxy != address(0), "ContractsRegistry: This mapping doesn't exist");
        require(_isProxy[contractProxy], "ContractsRegistry: Not a proxy contract");

        return _proxyUpgrader.getImplementation(contractProxy);
    }

    function upgradeContract(string calldata name, address newImplementation)
        external
        override
        onlyOwner
    {
        _upgradeContract(name, newImplementation, bytes(""));
    }

    /// @notice can only call functions that have no parameters
    function upgradeContractAndCall(
        string calldata name,
        address newImplementation,
        bytes memory data
    ) external override onlyOwner {
        _upgradeContract(name, newImplementation, data);
    }

    function _upgradeContract(
        string calldata name,
        address newImplementation,
        bytes memory data
    ) internal {
        address contractToUpgrade = _contracts[name];

        require(contractToUpgrade != address(0), "ContractsRegistry: This mapping doesn't exist");
        require(_isProxy[contractToUpgrade], "ContractsRegistry: Not a proxy contract");

        _proxyUpgrader.upgrade(contractToUpgrade, newImplementation, data);
    }

    function addContract(string calldata name, address contractAddress)
        external
        override
        onlyOwner
    {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        _contracts[name] = contractAddress;
    }

    function addProxyContract(string calldata name, address contractAddress)
        external
        override
        onlyOwner
    {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            contractAddress,
            address(_proxyUpgrader),
            ""
        );

        _contracts[name] = address(proxy);
        _isProxy[address(proxy)] = true;
    }

    function justAddProxyContract(string calldata name, address contractAddress)
        external
        override
        onlyOwner
    {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        _contracts[name] = contractAddress;
        _isProxy[contractAddress] = true;
    }

    function removeContract(string calldata name) external override onlyOwner {
        require(_contracts[name] != address(0), "ContractsRegistry: This mapping doesn't exist");

        delete _isProxy[_contracts[name]];
        delete _contracts[name];
    }
}
