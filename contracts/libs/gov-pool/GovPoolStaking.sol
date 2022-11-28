// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolStaking {
    using TokenBalance for address;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    function updateGlobalState(
        IGovPool.MicropoolInfo storage micropool,
        uint256 amount,
        uint256 coefficient,
        address rewardToken
    ) external {
        uint256 amountToAdd = amount.ratio(coefficient, PRECISION);

        IGovPool govPool = IGovPool(address(this));
        (, address userKeeper, , ) = govPool.getHelperContracts();

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
        address[] memory rewardTokens = micropool.rewardTokens.values();

        for (uint256 i; i < rewardTokens.length; i++) {
            uint256 micropoolCumulativeSum = micropool
                .rewardTokenInfos[rewardTokens[i]]
                .cumulativeSum;

            IGovPool govPool = IGovPool(address(this));
            (, address userKeeper, , ) = govPool.getHelperContracts();

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
}
