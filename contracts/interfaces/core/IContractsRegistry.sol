// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IContractsRegistry {
    function getTraderPoolFactoryContract() external view returns (address);

    function getTraderPoolRegistryContract() external view returns (address);

    function getDEXEContract() external view returns (address);

    function getPriceFeedContract() external view returns (address);

    function getDEXAbstractionContract() external view returns (address);

    function getInsuranceContract() external view returns (address);

    function getTreasuryContract() external view returns (address);

    function getDividendsContract() external view returns (address);

    function getCorePropertiesContract() external view returns (address);
}
