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

        IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalId];

        proposalInfo.cumulativeSum += amount.ratio(rewardsCoefficient, PRECISION).ratio(
            PRECISION,
            totalStake
        );
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

        _claim(micropoolPair[true], proposals, proposalIds, delegatee);
        _claim(micropoolPair[false], proposals, proposalIds, delegatee);
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
        rewards.expectedRewardsFor = _multiplyArrays(
            _getPendingRewards(micropoolPair[true], proposalIds, delegator, delegatee),
            _getRewardCoefficients(micropoolPair[true], proposalIds, delegator)
        );
        rewards.expectedRewardsAgainst = _multiplyArrays(
            _getPendingRewards(micropoolPair[false], proposalIds, delegator, delegatee),
            _getRewardCoefficients(micropoolPair[false], proposalIds, delegator)
        );

        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.realRewardsFor = new uint256[](proposalIds.length);
        rewards.realRewardsAgainst = new uint256[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            IGovPool.Proposal memory proposal = proposals[proposalIds[i]];

            address rewardToken = proposal.core.settings.rewardsInfo.rewardToken;

            if (rewardToken == address(0)) {
                continue;
            }

            uint256 thisBalance = rewardToken.normThisBalance();

            rewards.rewardTokens[i] = rewardToken;
            rewards.realRewardsFor[i] = rewards.expectedRewardsFor[i].min(thisBalance);

            if (proposal.actionsOnAgainst.length == 0) {
                rewards.expectedRewardsAgainst[i] = 0;
                continue;
            }

            rewards.realRewardsAgainst[i] = rewards.expectedRewardsAgainst[i].min(thisBalance);
        }
    }

    function _beforeRestake(
        IGovPool.MicropoolStakingInfo storage micropool,
        uint256[] calldata proposalIds,
        address delegatee
    ) private {
        uint256[] memory pendingRewards = _getPendingRewards(
            micropool,
            proposalIds,
            msg.sender,
            delegatee
        );

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.ProposalInfo storage proposalInfo = micropool.proposalInfos[proposalId];
            IGovPool.DelegatorInfo storage delegatorInfo = proposalInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards = pendingRewards[i];
            delegatorInfo.latestCumulativeSum = proposalInfo.cumulativeSum;

            if (pendingRewards[i] == 0) {
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
        uint256[] calldata proposalIds,
        address delegatee
    ) private {
        _beforeRestake(micropool, proposalIds, delegatee);

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

    function _getPendingRewards(
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

            if (suffixCancelSum >= suffixRewardSum) {
                continue;
            }

            coefficients[i] = (suffixRewardSum - suffixCancelSum).ratio(
                PRECISION,
                suffixRewardSum
            );
        }
    }

    function _addArrays(
        uint256[] memory lhs,
        uint256[] memory rhs
    ) private pure returns (uint256[] memory arr) {
        arr = new uint256[](lhs.length);

        for (uint256 i; i < lhs.length; ++i) {
            arr[i] = lhs[i] + rhs[i];
        }
    }

    function _multiplyArrays(
        uint256[] memory lhs,
        uint256[] memory rhs
    ) private pure returns (uint256[] memory arr) {
        arr = new uint256[](lhs.length);

        for (uint256 i; i < lhs.length; ++i) {
            arr[i] = lhs[i].ratio(rhs[i], PRECISION);
        }
    }
}
