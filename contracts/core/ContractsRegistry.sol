// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@solarity/solidity-lib/contracts-registry/presets/MultiOwnableContractsRegistry.sol";

import "@spherex-xyz/engine-contracts/src/SphereXEngine.sol";

import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/ProtectedTransparentProxy.sol";

contract ContractsRegistry is IContractsRegistry, MultiOwnableContractsRegistry, UUPSUpgradeable {
    string public constant USER_REGISTRY_NAME = "USER_REGISTRY";

    string public constant POOL_FACTORY_NAME = "POOL_FACTORY";
    string public constant POOL_REGISTRY_NAME = "POOL_REGISTRY";

    string public constant DEXE_NAME = "DEXE";
    string public constant USD_NAME = "USD";
    string public constant BABT_NAME = "BABT";
    string public constant DEXE_EXPERT_NFT_NAME = "DEXE_EXPERT_NFT";

    string public constant PRICE_FEED_NAME = "PRICE_FEED";

    string public constant TREASURY_NAME = "TREASURY";

    string public constant CORE_PROPERTIES_NAME = "CORE_PROPERTIES";

    string public constant SPHEREX_ENGINE_NAME = "SPHEREX_ENGINE";
    string public constant POOL_SPHEREX_ENGINE_NAME = "POOL_SPHEREX_ENGINE";

    function toggleSphereXEngine(bool on) external onlyOwner {
        address sphereXEngine = on ? getSphereXEngineContract() : address(0);

        _setSphereXEngine(USER_REGISTRY_NAME, sphereXEngine);
        _setSphereXEngine(POOL_FACTORY_NAME, sphereXEngine);
        _setSphereXEngine(POOL_REGISTRY_NAME, sphereXEngine);
        _setSphereXEngine(DEXE_EXPERT_NFT_NAME, sphereXEngine);
        _setSphereXEngine(PRICE_FEED_NAME, sphereXEngine);
        _setSphereXEngine(CORE_PROPERTIES_NAME, sphereXEngine);
    }

    function protectContractFunctions(
        string calldata contractName,
        bytes4[] calldata selectors
    ) external onlyOwner {
        SphereXProxyBase(getContract(contractName)).addProtectedFuncSigs(selectors);
    }

    function unprotectContractFunctions(
        string calldata contractName,
        bytes4[] calldata selectors
    ) external onlyOwner {
        SphereXProxyBase(getContract(contractName)).removeProtectedFuncSigs(selectors);
    }

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

    function getTreasuryContract() external view override returns (address) {
        return getContract(TREASURY_NAME);
    }

    function getCorePropertiesContract() external view override returns (address) {
        return getContract(CORE_PROPERTIES_NAME);
    }

    function getBABTContract() external view override returns (address) {
        return getContract(BABT_NAME);
    }

    function getDexeExpertNftContract() external view override returns (address) {
        return getContract(DEXE_EXPERT_NFT_NAME);
    }

    function getPoolSphereXEngineContract() external view override returns (address) {
        return getContract(POOL_SPHEREX_ENGINE_NAME);
    }

    function getSphereXEngineContract() public view override returns (address) {
        return getContract(SPHEREX_ENGINE_NAME);
    }

    function _setSphereXEngine(string memory contractName, address sphereXEngine) internal {
        ProtectedTransparentProxy(payable(getContract(contractName))).changeSphereXEngine(
            sphereXEngine
        );
    }

    function _deployProxy(
        address contractAddress,
        address admin,
        bytes memory data
    ) internal override returns (address proxy) {
        proxy = address(
            new ProtectedTransparentProxy(
                msg.sender,
                address(this),
                address(0),
                contractAddress,
                admin,
                data
            )
        );

        ISphereXEngine(getSphereXEngineContract()).addAllowedSenderOnChain(proxy);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
