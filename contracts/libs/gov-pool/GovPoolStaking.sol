// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../math/MathHelper.sol";

library GovPoolStaking {
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

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

    function updateLocalState(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) external {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 stakedAmount = IGovUserKeeper(userKeeper).getDelegatedAssetsAmount(
            msg.sender,
            delegatee
        );

        EnumerableSet.AddressSet storage rewardTokens = micropool.rewardTokens;

        uint256 rewardTokensLength = micropool.rewardTokens.length();

        for (uint256 i; i < rewardTokensLength; i++) {
            IGovPool.RewardTokenInfo storage rewardTokenInfo = micropool.rewardTokenInfos[
                rewardTokens.at(i)
            ];

            uint256 micropoolCumulativeSum = rewardTokenInfo.cumulativeSum;

            IGovPool.DelegatorInfo storage delegatorInfo = rewardTokenInfo.delegators[msg.sender];

            delegatorInfo.pendingRewards +=
                (micropoolCumulativeSum - delegatorInfo.latestCumulativeSum) *
                stakedAmount;
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;
        }
    }

    function claimDelegatedRewards(IGovPool.MicropoolInfo storage micropool) external {
        EnumerableSet.AddressSet storage rewardTokens = micropool.rewardTokens;

        uint256 rewardTokensLength = micropool.rewardTokens.length();

        for (uint256 i; i < rewardTokensLength; i++) {
            IGovPool.DelegatorInfo storage delegatorInfo = micropool
                .rewardTokenInfos[rewardTokens.at(i)]
                .delegators[msg.sender];

            uint256 rewards = delegatorInfo.pendingRewards;
            if (rewards == 0) {
                continue;
            }

            delegatorInfo.pendingRewards = 0;

            IERC20(rewardTokens.at(i)).safeTransfer(
                msg.sender,
                (rewards / PRECISION).from18(ERC20(rewardTokens.at(i)).decimals())
            );
        }
    }
}
