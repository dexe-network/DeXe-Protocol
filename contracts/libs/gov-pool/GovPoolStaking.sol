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

    event StakingRewardClaimed(address user, address token, uint256 amount);

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
                uint256[] memory expectedRewards
            ) = _getMicropoolPendingRewards(
                    micropoolInfos[delegatees[i]],
                    delegator,
                    delegatees[i]
                );

            uint256[] memory realRewards = new uint256[](expectedRewards.length);

            for (uint256 j = 0; j < realRewards.length; j++) {
                realRewards[j] = expectedRewards[j].min(rewardTokens[j].normThisBalance());
            }

            rewards[i] = IGovPool.UserStakeRewardsView({
                micropool: delegatees[i],
                rewardTokens: rewardTokens,
                expectedRewards: expectedRewards,
                realRewards: realRewards
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
            micropool
                .rewardTokenInfos[rewardTokens[i]]
                .delegators[msg.sender]
                .pendingRewards = pendingRewards[i];

            micropool
                .rewardTokenInfos[rewardTokens[i]]
                .delegators[msg.sender]
                .latestCumulativeSum = micropool.rewardTokenInfos[rewardTokens[i]].cumulativeSum;
        }

        if (!withdrawPendingRewards) {
            return;
        }

        for (uint256 i; i < rewardTokens.length; i++) {
            if (pendingRewards[i] == 0) {
                continue;
            }

            micropool.rewardTokenInfos[rewardTokens[i]].delegators[msg.sender].pendingRewards = 0;

            uint256 amountToTransfer = pendingRewards[i].min(rewardTokens[i].normThisBalance());

            rewardTokens[i].sendFunds(msg.sender, amountToTransfer);

            emit StakingRewardClaimed(msg.sender, rewardTokens[i], amountToTransfer);
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
            ? PRECISION.ratio(previousDelegatorStake, currentDelegatorStake)
            : PRECISION;

        rewardTokens = micropool.rewardTokens.values();
        pendingRewards = new uint256[](rewardTokens.length);

        for (uint256 i; i < rewardTokens.length; i++) {
            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardTokens[i]
            ];

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[delegator];

            pendingRewards[i] =
                delegatorInfo.pendingRewards +
                (rewardTokenInfo.cumulativeSum - delegatorInfo.latestCumulativeSum).ratio(
                    previousDelegatorStake,
                    rewardsDeviation
                );
        }
    }
}
