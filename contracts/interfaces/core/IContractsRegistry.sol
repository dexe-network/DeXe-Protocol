// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IContractsRegistry {
    function getTraderPoolFactoryContract() external view returns (address);

    function getTraderPoolRegistryContract() external view returns (address);

    function getDEXEContract() external view returns (address);

    function getUSDContract() external view returns (address);

    function getPriceFeedContract() external view returns (address);

    function getUniswapV2RouterContract() external view returns (address);

    function getUniswapV2FactoryContract() external view returns (address);

    function getInsuranceContract() external view returns (address);

    function getTreasuryContract() external view returns (address);

    function getDividendsContract() external view returns (address);

    function getCorePropertiesContract() external view returns (address);

    function getContract(string memory name) external view returns (address);

    function hasContract(string calldata name) external view returns (bool);

    function injectDependencies(string calldata name) external;

    function getProxyUpgrader() external view returns (address);

    function getImplementation(string calldata name) external view returns (address);

    function upgradeContract(string calldata name, address newImplementation) external;

    function upgradeContractAndCall(
        string calldata name,
        address newImplementation,
        string calldata functionSignature
    ) external;

    function addContract(string calldata name, address contractAddress) external;

    function addProxyContract(string calldata name, address contractAddress) external;

    function justAddProxyContract(string calldata name, address contractAddress) external;

    function deleteContract(string calldata name) external;
}
