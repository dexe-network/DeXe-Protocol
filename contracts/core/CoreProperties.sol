// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";
import "@dlsl/dev-modules/libs/data-structures/memory/Vector.sol";

import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/utils/AddressSetHelper.sol";

import "./Globals.sol";

contract CoreProperties is ICoreProperties, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using AddressSetHelper for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using Vector for Vector.AddressVector;
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

    function setDependencies(
        address contractsRegistry,
        bytes memory
    ) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _insuranceAddress = registry.getInsuranceContract();
        _treasuryAddress = registry.getTreasuryContract();
        _dividendsAddress = registry.getDividendsContract();
    }

    function setCoreParameters(
        CoreParameters calldata _coreParameters
    ) external override onlyOwner {
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

    function setMaximumPoolInvestors(uint64 count) external override onlyOwner {
        coreParameters.traderParams.maxPoolInvestors = count;
    }

    function setMaximumOpenPositions(uint64 count) external override onlyOwner {
        coreParameters.traderParams.maxOpenPositions = count;
    }

    function setTraderLeverageParams(uint32 threshold, uint32 slope) external override onlyOwner {
        coreParameters.traderParams.leverageThreshold = threshold;
        coreParameters.traderParams.leverageSlope = slope;
    }

    function setCommissionInitTimestamp(uint64 timestamp) external override onlyOwner {
        coreParameters.traderParams.commissionInitTimestamp = timestamp;
    }

    function setCommissionDurations(uint64[] calldata durations) external override onlyOwner {
        coreParameters.traderParams.commissionDurations = durations;
    }

    function setDEXECommissionPercentages(
        uint128 dexeCommission,
        uint128 govCommission,
        uint128[] calldata distributionPercentages
    ) external override onlyOwner {
        coreParameters.traderParams.dexeCommissionPercentage = dexeCommission;
        coreParameters
            .traderParams
            .dexeCommissionDistributionPercentages = distributionPercentages;
        coreParameters.govParams.govCommissionPercentage = govCommission;
    }

    function setTraderCommissionPercentages(
        uint256 minTraderCommission,
        uint256[] calldata maxTraderCommissions
    ) external override onlyOwner {
        coreParameters.traderParams.minTraderCommission = minTraderCommission;
        coreParameters.traderParams.maxTraderCommissions = maxTraderCommissions;
    }

    function setDelayForRiskyPool(uint64 delayForRiskyPool) external override onlyOwner {
        coreParameters.traderParams.delayForRiskyPool = delayForRiskyPool;
    }

    function setInsuranceParameters(
        InsuranceParameters calldata insuranceParams
    ) external override onlyOwner {
        coreParameters.insuranceParams = insuranceParams;
    }

    function setGovVotesLimit(uint128 newVotesLimit) external override onlyOwner {
        coreParameters.govParams.govVotesLimit = newVotesLimit;
    }

    function totalWhitelistTokens() external view override returns (uint256) {
        return _whitelistTokens.length();
    }

    function totalBlacklistTokens() external view override returns (uint256) {
        return _blacklistTokens.length();
    }

    function getWhitelistTokens(
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory tokens) {
        return _whitelistTokens.part(offset, limit);
    }

    function getBlacklistTokens(
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory tokens) {
        return _blacklistTokens.part(offset, limit);
    }

    function isWhitelistedToken(address token) external view override returns (bool) {
        return _whitelistTokens.contains(token);
    }

    function isBlacklistedToken(address token) external view override returns (bool) {
        return _blacklistTokens.contains(token);
    }

    function getFilteredPositions(
        address[] memory positions
    ) external view override returns (address[] memory) {
        Vector.AddressVector memory filter = Vector.newAddress();

        for (uint256 i = positions.length; i > 0; i--) {
            if (!_blacklistTokens.contains(positions[i - 1])) {
                filter.push(positions[i - 1]);
            }
        }

        return filter.toArray();
    }

    function getMaximumPoolInvestors() external view override returns (uint64) {
        return coreParameters.traderParams.maxPoolInvestors;
    }

    function getMaximumOpenPositions() external view override returns (uint64) {
        return coreParameters.traderParams.maxOpenPositions;
    }

    function getTraderLeverageParams() external view override returns (uint32, uint32) {
        return (
            coreParameters.traderParams.leverageThreshold,
            coreParameters.traderParams.leverageSlope
        );
    }

    function getCommissionInitTimestamp() public view override returns (uint64) {
        return coreParameters.traderParams.commissionInitTimestamp;
    }

    function getCommissionDuration(CommissionPeriod period) public view override returns (uint64) {
        return coreParameters.traderParams.commissionDurations[uint256(period)];
    }

    function getDEXECommissionPercentages()
        external
        view
        override
        returns (uint128, uint128, uint128[] memory, address[3] memory)
    {
        return (
            coreParameters.traderParams.dexeCommissionPercentage,
            coreParameters.govParams.govCommissionPercentage,
            coreParameters.traderParams.dexeCommissionDistributionPercentages,
            [_insuranceAddress, _treasuryAddress, _dividendsAddress]
        );
    }

    function getTraderCommissions() external view override returns (uint256, uint256[] memory) {
        return (
            coreParameters.traderParams.minTraderCommission,
            coreParameters.traderParams.maxTraderCommissions
        );
    }

    function getDelayForRiskyPool() external view override returns (uint64) {
        return coreParameters.traderParams.delayForRiskyPool;
    }

    function getInsuranceFactor() external view override returns (uint64) {
        return coreParameters.insuranceParams.insuranceFactor;
    }

    function getInsuranceWithdrawalLock() external view override returns (uint64) {
        return coreParameters.insuranceParams.insuranceWithdrawalLock;
    }

    function getMaxInsurancePoolShare() external view override returns (uint128) {
        return coreParameters.insuranceParams.maxInsurancePoolShare;
    }

    function getMinInsuranceDeposit() external view override returns (uint256) {
        return coreParameters.insuranceParams.minInsuranceDeposit;
    }

    function getGovVotesLimit() external view override returns (uint128) {
        return coreParameters.govParams.govVotesLimit;
    }

    function getCommissionEpochByTimestamp(
        uint256 timestamp,
        CommissionPeriod commissionPeriod
    ) external view override returns (uint256) {
        return
            (timestamp - getCommissionInitTimestamp()) /
            getCommissionDuration(commissionPeriod) +
            1;
    }

    function getCommissionTimestampByEpoch(
        uint256 epoch,
        CommissionPeriod commissionPeriod
    ) external view override returns (uint256) {
        return getCommissionInitTimestamp() + epoch * getCommissionDuration(commissionPeriod) - 1;
    }
}
