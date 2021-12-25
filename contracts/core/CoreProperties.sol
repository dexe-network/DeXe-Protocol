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

    function setCoreParameters(CoreParameters calldata _coreParameters)
        external
        override
        onlyOwner
    {
        coreParameters = _coreParameters;
    }

    function setMaximumPoolInvestors(uint256 count) external override onlyOwner {
        coreParameters.maxPoolInvestors = count;
    }

    function setMaximumOpenPositions(uint256 count) external override onlyOwner {
        coreParameters.maxOpenPositions = count;
    }

    function setTraderLeverageParams(uint256 threshold, uint256 slope)
        external
        override
        onlyOwner
    {
        coreParameters.leverageThreshold = threshold;
        coreParameters.leverageSlope = slope;
    }

    function setCommissionInitTimestamp(uint256 timestamp) external override onlyOwner {
        coreParameters.commissionInitTimestamp = timestamp;
    }

    function setCommissionDurations(uint256[] calldata durations) external override onlyOwner {
        coreParameters.commissionDurations = durations;
    }

    function setDEXECommissionPercentages(
        uint256 dexeCommission,
        uint256[] calldata distributionPercentages
    ) external override onlyOwner {
        coreParameters.dexeCommissionPercentage = dexeCommission;
        coreParameters.dexeCommissionDistributionPercentages = distributionPercentages;
    }

    function setTraderCommissionPercentages(
        uint256 minTraderCommission,
        uint256[] calldata maxTraderCommissions
    ) external override onlyOwner {
        coreParameters.minTraderCommission = minTraderCommission;
        coreParameters.maxTraderCommissions = maxTraderCommissions;
    }

    function setDelayForRiskyPool(uint256 delayForRiskyPool) external override onlyOwner {
        coreParameters.delayForRiskyPool = delayForRiskyPool;
    }

    function setInsuranceParameters(
        uint256 insuranceFactor,
        uint256 maxInsurancePoolShare,
        uint256 minInsuranceDeposit
    ) external override onlyOwner {
        coreParameters.insuranceFactor = insuranceFactor;
        coreParameters.maxInsurancePoolShare = maxInsurancePoolShare;
        coreParameters.minInsuranceDeposit = minInsuranceDeposit;
    }

    function getMaximumPoolInvestors() external view override returns (uint256) {
        return coreParameters.maxPoolInvestors;
    }

    function getMaximumOpenPositions() external view override returns (uint256) {
        return coreParameters.maxOpenPositions;
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
        return (coreParameters.minTraderCommission, coreParameters.maxTraderCommissions);
    }

    function getDelayForRiskyPool() external view override returns (uint256) {
        return coreParameters.delayForRiskyPool;
    }

    function getInsuranceFactor() external view override returns (uint256) {
        return coreParameters.insuranceFactor;
    }

    function getMaxInsurancePoolShare() external view override returns (uint256) {
        return coreParameters.maxInsurancePoolShare;
    }

    function getMinInsuranceDeposit() external view override returns (uint256) {
        return coreParameters.minInsuranceDeposit;
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
