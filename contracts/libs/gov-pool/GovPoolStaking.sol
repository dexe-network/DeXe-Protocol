// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolStaking {
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    function updateGlobalState(
        IGovPool.MicropoolInfo storage micropool,
        uint256 amount,
        uint256 coefficient,
        address rewardToken
    ) external {
        uint256 amountToAdd = amount.ratio(coefficient, PRECISION);

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        micropool.rewardTokens.add(rewardToken);
        micropool.rewardTokenInfos[msg.sender].cumulativeSum += amountToAdd.ratio(
            PRECISION,
            IGovUserKeeper(userKeeper).getMicropoolTotalStakeAmount(msg.sender)
        );
    }

    function updateLocalState(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) external {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        address[] memory rewardTokens = micropool.rewardTokens.values();

        for (uint256 i; i < rewardTokens.length; i++) {
            uint256 micropoolCumulativeSum = micropool
                .rewardTokenInfos[rewardTokens[i]]
                .cumulativeSum;

            uint256 stakedAmount = IGovUserKeeper(userKeeper).getDelegatedAssetsAmount(
                msg.sender,
                delegatee
            );

            IGovPool.DelegatorInfo storage delegatorInfo = micropool
                .rewardTokenInfos[rewardTokens[i]]
                .delegators[msg.sender];

            delegatorInfo.pendingRewards +=
                (micropoolCumulativeSum - delegatorInfo.latestCumulativeSum) *
                stakedAmount;
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;
        }
    }

    function claimDelegatedRewards(IGovPool.MicropoolInfo storage micropool) external {
        address[] memory rewardTokens = micropool.rewardTokens.values();

        for (uint256 i; i < rewardTokens.length; i++) {
            require(rewardTokens[i] != address(0), "Gov: rewards off");

            uint256 rewards = micropool
                .rewardTokenInfos[rewardTokens[i]]
                .delegators[msg.sender]
                .pendingRewards;

            IERC20(rewardTokens[i]).safeTransfer(
                msg.sender,
                (rewards / PRECISION).from18(ERC20(rewardTokens[i]).decimals())
            );
        }
    }
}
