// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolMicropoolRewards {
    function updateRewards(
        IGovPool.MicropoolInfo storage micropool,
        uint256 proposalId,
        uint256 amount
    ) external {
        micropool.pendingRewards[proposalId] = amount;
    }

    function saveDelegationInfo(
        mapping(bool => IGovPool.MicropoolInfo) storage micropoolPair,
        address delegatee
    ) external {
        _saveDelegationInfo(micropoolPair[true], delegatee);
        _saveDelegationInfo(micropoolPair[false], delegatee);
    }

    function _saveDelegationInfo(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) internal {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        /// TODO: take from snapshot
        uint256 delegatedAmount = IGovUserKeeper(userKeeper).getDelegatedAmount(
            msg.sender,
            delegatee
        );

        IGovPool.DelegatorInfo storage delegatorInfo = micropool.delegatorInfos[msg.sender];

        uint256[] storage delegationTimes = delegatorInfo.delegationTimes;
        uint256[] storage delegationAmounts = delegatorInfo.delegationAmounts;

        uint256 length = delegationTimes.length;

        if (length > 0 && delegationTimes[length - 1] == block.timestamp) {
            delegationTimes.pop();
            delegationAmounts.pop();
        }

        delegationTimes.push(block.timestamp);
        delegationAmounts.push(delegatedAmount);
    }
}
