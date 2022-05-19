// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/contracts-registry/AbstractDependant.sol";

import "../libs/AddressSetHelper.sol";

import "./Globals.sol";

contract CoreProperties is ICoreProperties, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using AddressSetHelper for EnumerableSet.AddressSet;
    using Math for uint256;

    CoreParameters public coreParameters;

    address internal _insuranceAddress;
    address internal _treasuryAddress;
    address internal _dividendsAddress;

    EnumerableSet.AddressSet internal _whitelistTokens;
    EnumerableSet.AddressSet internal _blacklistTokens;

    function __CoreProperties_init(CoreParameters calldata _coreParameters) external initializer {
        __Ownable_init();

        coreParameters = _coreParameters;
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _insuranceAddress = registry.getInsuranceContract();
        _treasuryAddress = registry.getTreasuryContract();
        _dividendsAddress = registry.getDividendsContract();
    }

    function setCoreParameters(CoreParameters calldata _coreParameters)
        external
        override
        onlyOwner
    {
        coreParameters = _coreParameters;
    }

    function addWhitelistTokens(address[] calldata tokens) external override onlyOwner {
        _whitelistTokens.add(tokens);
    }

    function removeWhitelistTokens(address[] calldata tokens) external override onlyOwner {
        _whitelistTokens.remove(tokens);
    }

    function addBlacklistTokens(address[] calldata tokens) external override onlyOwner {
        _blacklistTokens.add(tokens);
    }

    function removeBlacklistTokens(address[] calldata tokens) external override onlyOwner {
        _blacklistTokens.remove(tokens);
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

    function totalWhitelistTokens() external view override returns (uint256) {
        return _whitelistTokens.length();
    }

    function totalBlacklistTokens() external view override returns (uint256) {
        return _blacklistTokens.length();
    }

    function getWhitelistTokens(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory tokens)
    {
        uint256 to = (offset + limit).min(_whitelistTokens.length()).max(offset);

        tokens = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            tokens[i - offset] = _whitelistTokens.at(i);
        }
    }

    function getBlacklistTokens(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory tokens)
    {
        uint256 to = (offset + limit).min(_blacklistTokens.length()).max(offset);

        tokens = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            tokens[i - offset] = _blacklistTokens.at(i);
        }
    }

    function isWhitelistedToken(address token) external view override returns (bool) {
        return _whitelistTokens.contains(token);
    }

    function isBlacklistedToken(address token) external view override returns (bool) {
        return _blacklistTokens.contains(token);
    }

    function getFilteredPositions(address[] memory positions)
        external
        view
        override
        returns (address[] memory filteredPositions)
    {
        uint256 newLength = positions.length;

        for (uint256 i = positions.length; i > 0; i--) {
            if (_blacklistTokens.contains(positions[i - 1])) {
                if (i == newLength) {
                    --newLength;
                } else {
                    positions[i - 1] = positions[--newLength];
                }
            }
        }

        filteredPositions = new address[](newLength);

        for (uint256 i = 0; i < newLength; i++) {
            filteredPositions[i] = positions[i];
        }
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
