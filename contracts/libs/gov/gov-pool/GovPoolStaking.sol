// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

library GovPoolStaking {
    using TokenBalance for address;
    using MathHelper for uint256;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    event StakingRewardClaimed(address user, address token, uint256 amount);

    function updateRewards(
        IGovPool.MicropoolStakingInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        bool isVoteFor,
        uint256 amount
    ) external {
        uint256 totalStake = micropool.totalStake;

        if (totalStake == 0) {
            return;
        }

        IGovSettings.RewardsInfo memory rewardsInfo = proposals[proposalId]
            .core
            .settings
            .rewardsInfo;

        uint256 rewardsCoefficient = isVoteFor
            ? rewardsInfo.voteForRewardsCoefficient
            : rewardsInfo.voteAgainstRewardsCoefficient;
        uint256 amountToAdd = amount.ratio(rewardsCoefficient, PRECISION);

        micropool.proposalInfos[proposalId].cumulativeSum += amountToAdd.ratio(
            PRECISION,
            totalStake
        );
    }

    function claim(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropools,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds,
        address delegatee
    ) external {
        for (uint256 i; i < proposalIds.length; i++) {
            require(proposals[proposalIds[i]].core.executed, "Gov: not executed");
        }

        doBeforeRestake(micropools, proposalIds, delegatee);

        _claim(micropools[true], proposals, proposalIds);
        _claim(micropools[false], proposals, proposalIds);
    }

    function doBeforeRestake(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropools,
        uint256[] calldata proposalIds,
        address delegatee
    ) public {
        _doBeforeRestake(micropools[true], proposalIds, delegatee);
        _doBeforeRestake(micropools[false], proposalIds, delegatee);
    }

    function doAfterRestake(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropools,
        address delegatee
    ) external {
        _doAfterRestake(micropools[true], delegatee);
        _doAfterRestake(micropools[false], delegatee);
    }

    function getDelegatorStakingRewards(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropoolInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view returns (IGovPool.DelegatorStakingRewards memory rewards) {
        uint256[] memory expectedRewardsFor = _getMicropoolPendingRewards(
            micropoolInfos[true],
            proposalIds,
            delegator,
            delegatee
        );
        uint256[] memory expectedRewardsAgainst = _getMicropoolPendingRewards(
            micropoolInfos[false],
            proposalIds,
            delegator,
            delegatee
        );

        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.expectedRewards = new uint256[](proposalIds.length);
        rewards.realRewards = new uint256[](proposalIds.length);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            address rewardToken = proposals[proposalIds[i]].core.settings.rewardsInfo.rewardToken;

            rewards.rewardTokens[i] = rewardToken;
            rewards.expectedRewards[i] = expectedRewardsFor[i] + expectedRewardsAgainst[i];
            rewards.realRewards[i] = rewards.expectedRewards[i].min(
                rewards.rewardTokens[i].normThisBalance()
            );
        }
    }

    function _doBeforeRestake(
        IGovPool.MicropoolStakingInfo storage micropool,
        uint256[] calldata proposalIds,
        address delegatee
    ) private {
        uint256[] memory pendingRewards = _getMicropoolPendingRewards(
            micropool,
            proposalIds,
            msg.sender,
            delegatee
        );

        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalIds[i]];

            proposalInfo.delegators[msg.sender] = IGovPool.DelegatorInfo({
                pendingRewards: pendingRewards[i],
                latestCumulativeSum: proposalInfo.cumulativeSum
            });
        }
    }

    function _doAfterRestake(
        IGovPool.MicropoolStakingInfo storage micropool,
        address delegatee
    ) private {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 currentDelegatorStake = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            msg.sender,
            delegatee
        );

        micropool.totalStake -= micropool.latestDelegatorStake[msg.sender];
        micropool.totalStake += currentDelegatorStake;
        micropool.latestDelegatorStake[msg.sender] = currentDelegatorStake;
    }

    function _claim(
        IGovPool.MicropoolStakingInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds
    ) private {
        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalIds[i]];
            IGovPool.DelegatorInfo storage delegatorInfo = proposalInfo.delegators[msg.sender];

            address rewardToken = proposals[proposalIds[i]].core.settings.rewardsInfo.rewardToken;
            uint256 pendingRewards = delegatorInfo.pendingRewards;

            // TODO: check
            delegatorInfo.pendingRewards = 0;
            delegatorInfo.latestCumulativeSum = proposalInfo.cumulativeSum;

            if (pendingRewards == 0) {
                return;
            }

            uint256 amountToTransfer = pendingRewards.min(rewardToken.normThisBalance());

            rewardToken.sendFunds(msg.sender, amountToTransfer, true);

            emit StakingRewardClaimed(msg.sender, rewardToken, amountToTransfer);
        }
    }

    function _getMicropoolPendingRewards(
        IGovPool.MicropoolStakingInfo storage micropool,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) private view returns (uint256[] memory pendingRewards) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 currentDelegatorStake = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            delegator,
            delegatee
        );
        uint256 previousDelegatorStake = micropool.latestDelegatorStake[delegator];
        uint256 rewardsDeviation = previousDelegatorStake > currentDelegatorStake &&
            currentDelegatorStake != 0
            ? PRECISION.ratio(previousDelegatorStake, currentDelegatorStake)
            : PRECISION;

        pendingRewards = new uint256[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalIds[i]];

            IGovPool.DelegatorInfo memory delegatorInfo = proposalInfo.delegators[delegator];

            pendingRewards[i] =
                delegatorInfo.pendingRewards +
                (proposalInfo.cumulativeSum - delegatorInfo.latestCumulativeSum).ratio(
                    previousDelegatorStake,
                    rewardsDeviation
                );
        }
    }
}
