// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "./Globals.sol";

contract CoreProperties is ICoreProperties, OwnableUpgradeable, AbstractDependant {
    CoreParameters public coreParameters;

    address internal _insuranceAddress;
    address internal _treasuryAddress;
    address internal _dividendsAddress;

    function __CoreProperties_init(CoreParameters calldata _coreParameters) external initializer {
        __Ownable_init();

        coreParameters = _coreParameters;
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        public
        virtual
        override
        dependant
    {
        _insuranceAddress = contractsRegistry.getInsuranceContract();
        _treasuryAddress = contractsRegistry.getTreasuryContract();
        _dividendsAddress = contractsRegistry.getDividendsContract();
    }

    function setCoreParameters(CoreParameters calldata _coreParameters) external onlyOwner {
        coreParameters = _coreParameters;
    }

    function setMaximumPoolInvestors(uint256 count) external onlyOwner {
        coreParameters.maximumPoolInvestors = count;
    }

    function setMaximumOpenPositions(uint256 count) external onlyOwner {
        coreParameters.maximumOpenPositions = count;
    }

    function setTraderLeverageParams(uint256 threshold, uint256 slope) external onlyOwner {
        coreParameters.leverageThreshold = threshold;
        coreParameters.leverageSlope = slope;
    }

    function setCommissionInitTimestamp(uint256 timestamp) external onlyOwner {
        coreParameters.commissionInitTimestamp = timestamp;
    }

    function setCommissionDurations(uint256[] calldata durations) external onlyOwner {
        coreParameters.commissionDurations = durations;
    }

    function setDEXECommissionPercentages(
        uint256 dexeCommission,
        uint256[] calldata distributionPercentages
    ) external {
        coreParameters.dexeCommissionPercentage = dexeCommission;
        coreParameters.dexeCommissionDistributionPercentages = distributionPercentages;
    }

    function getMaximumPoolInvestors() external view override returns (uint256) {
        return coreParameters.maximumPoolInvestors;
    }

    function getMaximumOpenPositions() external view override returns (uint256) {
        return coreParameters.maximumOpenPositions;
    }

    function getTraderLeverageParams() external view override returns (uint256, uint256) {
        return (coreParameters.leverageThreshold, coreParameters.leverageSlope);
    }

    function getCommissionInitTimestamp() public view override returns (uint256) {
        return coreParameters.commissionInitTimestamp;
    }

    function getCommissionDuration(CommissionPeriod period)
        public
        view
        override
        returns (uint256)
    {
        return coreParameters.commissionDurations[uint256(period)];
    }

    function getDEXECommissionPercentages()
        external
        view
        override
        returns (
            uint256,
            uint256[] memory,
            address[3] memory
        )
    {
        return (
            coreParameters.dexeCommissionPercentage,
            coreParameters.dexeCommissionDistributionPercentages,
            [_insuranceAddress, _treasuryAddress, _dividendsAddress]
        );
    }

    function getTraderCommissions() external view override returns (uint256, uint256[] memory) {
        return (coreParameters.minimalTraderCommission, coreParameters.maximalTraderCommissions);
    }

    function getDelayForRiskyPool() external view override returns (uint256) {
        return coreParameters.delayForRiskyPool;
    }

    function getCommissionEpoch(uint256 timestamp, CommissionPeriod commissionPeriod)
        external
        view
        override
        returns (uint256)
    {
        return
            (timestamp - getCommissionInitTimestamp()) /
            getCommissionDuration(commissionPeriod) +
            1;
    }
}
