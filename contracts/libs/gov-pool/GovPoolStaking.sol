// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolStaking {
    using TokenBalance for address;
    using MathHelper for uint256;

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

    function updateLocalState(IGovPool.MicropoolInfo storage micropool) external {
        EnumerableSet.AddressSet storage rewardTokens = micropool.rewardTokens;

        for (uint256 i; i < rewardTokens.length(); i++) {
            IGovPool.DelegatorInfo storage delegatorInfo = micropool
                .rewardTokenInfos[rewardTokens.at(i)]
                .delegators[msg.sender];

            uint256 micropoolCumulativeSum = micropool.rewardTokenInfos[rewardTokens.at(i)];

            IGovPool govPool = IGovPool(address(this));
            (, address userKeeper, , ) = govPool.getHelperContracts();

            uint256 stakedAmount = IGovUserKeeper(userKeeper).getDelegatedAssetsAmount(
                msg.sender,
                delegatee
            );

            delegatorInfo.pendingRewards +=
                (micropoolCumulativeSum - delegatorInfo.latestCumulativeSum) *
                stakedAmount;
            delegatorInfo.latestCumulativeSum = micropoolCumulativeSum;
        }
    }
}
