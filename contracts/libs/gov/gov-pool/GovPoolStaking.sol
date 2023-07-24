// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

library GovPoolStaking {
    using TokenBalance for address;
    using MathHelper for uint256;
    using Math for uint256;

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

        IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalId];

        proposalInfo.cumulativeSum += amountToAdd.ratio(PRECISION, totalStake);
        proposalInfo.rewardSum += amount;
    }

    function cancelRewards(
        IGovPool.MicropoolStakingInfo storage micropool,
        uint256 proposalId,
        uint256 amount
    ) external {
        micropool.proposalInfos[proposalId].cancelSum += amount;
    }

    function claim(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropoolPair,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds,
        address delegatee
    ) external {
        for (uint256 i; i < proposalIds.length; i++) {
            require(proposals[proposalIds[i]].core.executed, "Gov: not executed");
        }

        beforeRestake(micropoolPair, proposalIds, delegatee);

        _claim(micropoolPair[true], proposals, proposalIds);
        _claim(micropoolPair[false], proposals, proposalIds);
    }

    function beforeRestake(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropoolPair,
        uint256[] calldata proposalIds,
        address delegatee
    ) public {
        _beforeRestake(micropoolPair[true], proposalIds, delegatee);
        _beforeRestake(micropoolPair[false], proposalIds, delegatee);
    }

    function afterRestake(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropoolPair,
        address delegatee
    ) external {
        _afterRestake(micropoolPair[true], delegatee);
        _afterRestake(micropoolPair[false], delegatee);
    }

    function getDelegatorStakingRewards(
        mapping(bool => IGovPool.MicropoolStakingInfo) storage micropoolPair,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view returns (IGovPool.DelegatorStakingRewards memory rewards) {
        uint256[] memory expectedRewardsFor = _getMicropoolPendingRewards(
            micropoolPair[true],
            proposalIds,
            delegator,
            delegatee
        );
        uint256[] memory expectedRewardsAgainst = _getMicropoolPendingRewards(
            micropoolPair[false],
            proposalIds,
            delegator,
            delegatee
        );

        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.expectedRewards = new uint256[](proposalIds.length);
        rewards.realRewards = new uint256[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            address rewardToken = proposals[proposalIds[i]].core.settings.rewardsInfo.rewardToken;

            rewards.rewardTokens[i] = rewardToken;
            rewards.expectedRewards[i] = expectedRewardsFor[i] + expectedRewardsAgainst[i];
            rewards.realRewards[i] = rewards.expectedRewards[i].min(
                rewards.rewardTokens[i].normThisBalance()
            );
        }
    }

    function _beforeRestake(
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
            IGovPool.DelegatorInfo storage delegatorInfo = proposalInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards = pendingRewards[i];
            delegatorInfo.latestCumulativeSum = proposalInfo.cumulativeSum;

            /// TODO: can it be implemented without joined field?
            if (!delegatorInfo.joined) {
                delegatorInfo.joined = true;
                delegatorInfo.startRewardSum = proposalInfo.rewardSum;
                delegatorInfo.startCancelSum = proposalInfo.cancelSum;
            }
        }
    }

    function _afterRestake(
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
        uint256[] memory rewardCoefficients = _getRewardCoefficients(
            micropool,
            proposalIds,
            msg.sender
        );

        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalIds[i]];
            IGovPool.DelegatorInfo storage delegatorInfo = proposalInfo.delegators[msg.sender];

            address rewardToken = proposals[proposalIds[i]].core.settings.rewardsInfo.rewardToken;
            uint256 pendingRewards = delegatorInfo.pendingRewards.ratio(
                rewardCoefficients[i],
                PRECISION
            );

            delegatorInfo.pendingRewards = 0;
            delegatorInfo.latestCumulativeSum = proposalInfo.cumulativeSum;

            if (pendingRewards == 0) {
                return;
            }

            rewardToken.sendFunds(msg.sender, pendingRewards, TokenBalance.TransferType.TryMint);

            emit StakingRewardClaimed(msg.sender, rewardToken, pendingRewards);
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

    function _getRewardCoefficients(
        IGovPool.MicropoolStakingInfo storage micropool,
        uint256[] calldata proposalIds,
        address delegator
    ) private view returns (uint256[] memory coefficients) {
        coefficients = new uint256[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalIds[i]];

            IGovPool.DelegatorInfo memory delegatorInfo = proposalInfo.delegators[delegator];

            uint256 suffixRewardSum = proposalInfo.rewardSum - delegatorInfo.startRewardSum;
            uint256 suffixCancelSum = proposalInfo.cancelSum - delegatorInfo.startCancelSum;

            if (suffixCancelSum > suffixRewardSum) {
                return 0;
            }

            coefficients[i] = (suffixRewardSum - suffixCancelSum).ratio(
                PRECISION,
                suffixRewardSum
            );
        }
    }
}
