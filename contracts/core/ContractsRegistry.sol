// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "../helpers/ProxyUpgrader.sol";

contract ContractsRegistry is IContractsRegistry, OwnableUpgradeable {
    ProxyUpgrader internal proxyUpgrader;

    string public constant TRADER_POOL_FACTORY_NAME = "TRADER_POOL_FACTORY";
    string public constant TRADER_POOL_REGISTRY_NAME = "TRADER_POOL_REGISTRY";

    string public constant DEXE_NAME = "DEXE";
    string public constant DAI_NAME = "DAI";

    string public constant PRICE_FEED_NAME = "PRICE_FEED";
    string public constant UNISWAP_V2_ROUTER_NAME = "UNISWAP_V2_ROUTER";

    string public constant INSURANCE_NAME = "INSURANCE";
    string public constant TREASURY_NAME = "TREASURY";
    string public constant DIVIDENDS_NAME = "DIVIDENDS";

    string public constant CORE_PROPERTIES_NAME = "CORE_PROPERTIES";

    mapping(string => address) private _contracts;
    mapping(address => bool) private _isProxy;

    function __ContractsRegistry_init() external initializer {
        __Ownable_init();

        proxyUpgrader = new ProxyUpgrader();
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

    function getDAIContract() external view override returns (address) {
        return getContract(DAI_NAME);
    }

    function getPriceFeedContract() external view override returns (address) {
        return getContract(PRICE_FEED_NAME);
    }

    function getUniswapV2RouterContract() external view override returns (address) {
        return getContract(UNISWAP_V2_ROUTER_NAME);
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

    function getContract(string memory name) public view returns (address) {
        address contractAddress = _contracts[name];

        require(contractAddress != address(0), "ContractsRegistry: This mapping doesn't exist");

        return contractAddress;
    }

    function hasContract(string calldata name) external view returns (bool) {
        return _contracts[name] != address(0);
    }

    function injectDependencies(string calldata name) external onlyOwner {
        address contractAddress = _contracts[name];

        require(contractAddress != address(0), "ContractsRegistry: This mapping doesn't exist");

        AbstractDependant dependant = AbstractDependant(contractAddress);
        if (dependant.injector() == address(0)) {
            dependant.setInjector(address(this));
        }

        dependant.setDependencies(this);
    }

    function getProxyUpgrader() external view returns (address) {
        require(address(proxyUpgrader) != address(0), "ContractsRegistry: Bad ProxyUpgrader");

        return address(proxyUpgrader);
    }

    function getImplementation(string calldata name) external view returns (address) {
        address contractProxy = _contracts[name];

        require(contractProxy != address(0), "ContractsRegistry: This mapping doesn't exist");
        require(_isProxy[contractProxy], "ContractsRegistry: Not a proxy contract");

        return proxyUpgrader.getImplementation(contractProxy);
    }

    function upgradeContract(string calldata name, address newImplementation) external onlyOwner {
        _upgradeContract(name, newImplementation, "");
    }

    /// @notice can only call functions that have no parameters
    function upgradeContractAndCall(
        string calldata name,
        address newImplementation,
        string calldata functionSignature
    ) external onlyOwner {
        _upgradeContract(name, newImplementation, functionSignature);
    }

    function _upgradeContract(
        string memory name,
        address newImplementation,
        string memory functionSignature
    ) internal {
        address contractToUpgrade = _contracts[name];

        require(contractToUpgrade != address(0), "ContractsRegistry: This mapping doesn't exist");
        require(_isProxy[contractToUpgrade], "ContractsRegistry: Not a proxy contract");

        proxyUpgrader.upgrade(
            contractToUpgrade,
            newImplementation,
            abi.encodeWithSignature(functionSignature)
        );
    }

    function addContract(string calldata name, address contractAddress) external onlyOwner {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        _contracts[name] = contractAddress;
    }

    function addProxyContract(string calldata name, address contractAddress) external onlyOwner {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            contractAddress,
            address(proxyUpgrader),
            ""
        );

        _contracts[name] = address(proxy);
        _isProxy[address(proxy)] = true;
    }

    function justAddProxyContract(string calldata name, address contractAddress)
        external
        onlyOwner
    {
        require(contractAddress != address(0), "ContractsRegistry: Null address is forbidden");

        _contracts[name] = contractAddress;
        _isProxy[contractAddress] = true;
    }

    function deleteContract(string calldata name) external onlyOwner {
        require(_contracts[name] != address(0), "ContractsRegistry: This mapping doesn't exist");

        delete _isProxy[_contracts[name]];
        delete _contracts[name];
    }
}
