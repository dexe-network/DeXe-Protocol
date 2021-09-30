// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IContractsRegistry {
    // function getInsuranceContract() external view returns (address);

    function getTraderPoolFactoryContract() external view returns (address);

    function getTraderPoolRegistryContract() external view returns (address);

    function getDEXEContract() external view returns (address);
}
