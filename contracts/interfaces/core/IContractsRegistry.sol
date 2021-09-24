// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IContractsRegistry {
    // function getCorePropertiesContract() external view returns (address);

    // function getPriceFeedcontract() external view returns (address);

    // function getDEXAbstractionContract() external view returns (address);

    // function getInsuranceContract() external view returns (address);

    // function getInsuranceVotingContract() external view returns (address);

    function getTraderPoolFactoryContract() external view returns (address);

    function getTraderPoolRegistryContract() external view returns (address);
}
