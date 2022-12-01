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
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 totalStake = IGovUserKeeper(userKeeper).getMicropoolTotalStakeAmount(msg.sender);
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

    function _recalculateStakingState(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        bool withdrawPendingRewards
    ) private {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 stakedAmount = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            msg.sender,
            delegatee
        );

        EnumerableSet.AddressSet storage rewardTokens = micropool.rewardTokens;

        uint256 rewardTokensLength = micropool.rewardTokens.length();

        for (uint256 i; i < rewardTokensLength; i++) {
            address rewardToken = rewardTokens.at(i);

            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardToken
            ];

            uint256 micropoolCumulativeSum = rewardTokenInfo.cumulativeSum;

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards += (micropoolCumulativeSum -
                delegatorInfo.latestCumulativeSum).ratio(stakedAmount, PRECISION);
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;

            uint256 rewards = delegatorInfo.pendingRewards;

            if (!withdrawPendingRewards || rewards == 0) {
                continue;
            }

            delegatorInfo.pendingRewards = 0;

            rewardToken.sendFunds(msg.sender, rewards.min(rewardToken.normThisBalance()));
        }
    }
}
