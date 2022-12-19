// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolStaking {
    using TokenBalance for address;
    using MathHelper for uint256;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    function updateRewards(
        IGovPool.MicropoolInfo storage micropool,
        uint256 amount,
        uint256 coefficient,
        address rewardToken
    ) external {
        uint256 totalStake = micropool.totalStake;
        if (totalStake == 0) {
            return;
        }

        uint256 amountToAdd = amount.ratio(coefficient, PRECISION);

        micropool.rewardTokens.add(rewardToken);
        micropool.rewardTokenInfos[rewardToken].cumulativeSum += amountToAdd.ratio(
            PRECISION,
            totalStake
        );
    }

    function stake(IGovPool.MicropoolInfo storage micropool, address delegatee) external {
        _recalculateStakingState(micropool, delegatee, false);
    }

    function unstake(IGovPool.MicropoolInfo storage micropool, address delegatee) external {
        _recalculateStakingState(micropool, delegatee, true);
    }

    function updateStakingCache(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) external {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 currentDelegatorStake = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            msg.sender,
            delegatee
        );

        micropool.totalStake -= micropool.latestDelegatorStake[msg.sender];
        micropool.totalStake += currentDelegatorStake;
        micropool.latestDelegatorStake[msg.sender] = currentDelegatorStake;
    }

    function getDelegatorStakingRewards(
        mapping(address => IGovPool.MicropoolInfo) storage micropoolInfos,
        address delegator
    ) external view returns (IGovPool.UserStakeRewardsView[] memory rewards) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        address[] memory delegatees = IGovUserKeeper(userKeeper).getDelegatees(delegator);

        rewards = new IGovPool.UserStakeRewardsView[](delegatees.length);

        for (uint256 i = 0; i < delegatees.length; i++) {
            (
                address[] memory rewardTokens,
                uint256[] memory pendingRewards
            ) = _getMicropoolPendingRewards(
                    micropoolInfos[delegatees[i]],
                    delegator,
                    delegatees[i]
                );

            rewards[i] = IGovPool.UserStakeRewardsView({
                micropool: delegatees[i],
                rewardTokens: rewardTokens,
                pendingRewards: pendingRewards
            });
        }
    }

    function _recalculateStakingState(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        bool withdrawPendingRewards
    ) private {
        (
            address[] memory rewardTokens,
            uint256[] memory pendingRewards
        ) = _getMicropoolPendingRewards(micropool, msg.sender, delegatee);

        for (uint256 i; i < rewardTokens.length; i++) {
            address rewardToken = rewardTokens[i];

            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardToken
            ];

            uint256 micropoolCumulativeSum = rewardTokenInfo.cumulativeSum;

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards = pendingRewards[i];
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;

            uint256 rewards = delegatorInfo.pendingRewards;

            if (!withdrawPendingRewards || rewards == 0) {
                continue;
            }

            delegatorInfo.pendingRewards = 0;

            rewardToken.sendFunds(msg.sender, rewards.min(rewardToken.normThisBalance()));
        }
    }

    function _getMicropoolPendingRewards(
        IGovPool.MicropoolInfo storage micropool,
        address delegator,
        address delegatee
    ) private view returns (address[] memory rewardTokens, uint256[] memory pendingRewards) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 currentDelegatorStake = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            delegator,
            delegatee
        );

        uint256 previousDelegatorStake = micropool.latestDelegatorStake[delegator];

        uint256 rewardsDeviation = previousDelegatorStake > currentDelegatorStake &&
            currentDelegatorStake != 0
            ? previousDelegatorStake / currentDelegatorStake
            : 1;

        rewardTokens = micropool.rewardTokens.values();
        pendingRewards = new uint256[](rewardTokens.length);

        for (uint256 i; i < rewardTokens.length; i++) {
            address rewardToken = rewardTokens[i];

            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardToken
            ];

            uint256 micropoolCumulativeSum = rewardTokenInfo.cumulativeSum;

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[msg.sender];

            pendingRewards[i] =
                delegatorInfo.pendingRewards +
                (micropoolCumulativeSum - delegatorInfo.latestCumulativeSum).ratio(
                    previousDelegatorStake,
                    PRECISION
                ) /
                rewardsDeviation;
        }
    }
}
