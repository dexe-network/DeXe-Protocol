// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/contracts-registry/AbstractDependant.sol";
import "@solarity/solidity-lib/libs/arrays/Paginator.sol";

import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/utils/AddressSetHelper.sol";

import "./Globals.sol";

contract CoreProperties is ICoreProperties, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using AddressSetHelper for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using Math for uint256;

    CoreParameters public coreParameters;

    address internal _treasuryAddress;

    function __CoreProperties_init(CoreParameters calldata _coreParameters) external initializer {
        __Ownable_init();

        coreParameters = _coreParameters;
    }

    function setDependencies(
        address contractsRegistry,
        bytes memory
    ) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _treasuryAddress = registry.getTreasuryContract();
    }

    function setCoreParameters(
        CoreParameters calldata _coreParameters
    ) external override onlyOwner {
        coreParameters = _coreParameters;
    }

    function setDEXECommissionPercentages(uint128 govCommission) external override onlyOwner {
        coreParameters.govCommissionPercentage = govCommission;
    }

    function setTokenSaleProposalCommissionPercentage(
        uint128 tokenSaleProposalCommissionPercentage
    ) external override onlyOwner {
        coreParameters
            .tokenSaleProposalCommissionPercentage = tokenSaleProposalCommissionPercentage;
    }

    function setVoteRewardsPercentages(
        uint128 micropoolVoteRewardsPercentage,
        uint128 treasuryVoteRewardsPercentage
    ) external override onlyOwner {
        coreParameters.micropoolVoteRewardsPercentage = micropoolVoteRewardsPercentage;
        coreParameters.treasuryVoteRewardsPercentage = treasuryVoteRewardsPercentage;
    }

    function setGovVotesLimit(uint128 newVotesLimit) external override onlyOwner {
        coreParameters.govVotesLimit = newVotesLimit;
    }

    function getDEXECommissionPercentages() external view override returns (uint128, address) {
        return (coreParameters.govCommissionPercentage, _treasuryAddress);
    }

    function getTokenSaleProposalCommissionPercentage() external view override returns (uint128) {
        return coreParameters.tokenSaleProposalCommissionPercentage;
    }

    function getVoteRewardsPercentages() external view override returns (uint128, uint128) {
        return (
            coreParameters.micropoolVoteRewardsPercentage,
            coreParameters.treasuryVoteRewardsPercentage
        );
    }

    function getGovVotesLimit() external view override returns (uint128) {
        return coreParameters.govVotesLimit;
    }
}
