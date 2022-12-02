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

    function stake(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external {
        _recalculateStakingState(
            micropool,
            delegatee,
            int256(_getStakeDifference(amount, nftIds)),
            false
        );
    }

    function unstake(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external {
        _recalculateStakingState(
            micropool,
            delegatee,
            -int256(_getStakeDifference(amount, nftIds)),
            true
        );
    }

    function _recalculateStakingState(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        int256 stakeDifference,
        bool withdrawPendingRewards
    ) private {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 stakedAmount = IGovUserKeeper(userKeeper).getDelegatedStakeAmount(
            msg.sender,
            delegatee
        );

        uint256 previousDelegatorStake = micropool.latestDelegatorStake[msg.sender];
        uint256 currentDelegatorStake = uint256(int256(stakedAmount) + stakeDifference);

        uint256 rewardsDeviation = _calculateDeviation(previousDelegatorStake, stakedAmount);

        micropool.totalStake -= previousDelegatorStake;
        micropool.totalStake += currentDelegatorStake;
        micropool.latestDelegatorStake[msg.sender] = currentDelegatorStake;

        EnumerableSet.AddressSet storage rewardTokens = micropool.rewardTokens;

        uint256 rewardTokensLength = micropool.rewardTokens.length();

        for (uint256 i; i < rewardTokensLength; i++) {
            address rewardToken = rewardTokens.at(i);

            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardToken
            ];

            uint256 micropoolCumulativeSum = rewardTokenInfo.cumulativeSum;

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards +=
                (micropoolCumulativeSum - delegatorInfo.latestCumulativeSum).ratio(
                    stakedAmount,
                    PRECISION
                ) /
                rewardsDeviation;
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;

            uint256 rewards = delegatorInfo.pendingRewards;

            if (!withdrawPendingRewards || rewards == 0) {
                continue;
            }

            delegatorInfo.pendingRewards = 0;

            rewardToken.sendFunds(msg.sender, rewards.min(rewardToken.normThisBalance()));
        }
    }

    function _getStakeDifference(
        uint256 amount,
        uint256[] calldata nftIds
    ) private view returns (uint256) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        return amount + IGovUserKeeper(userKeeper).getTotalNftsPower(nftIds);
    }

    function _calculateDeviation(
        uint256 numerator,
        uint256 denominator
    ) private pure returns (uint256) {
        if (numerator < denominator) {
            (numerator, denominator) = (denominator, numerator);
        }

        if (denominator == 0) {
            return 1;
        }

        return numerator / denominator;
    }
}
