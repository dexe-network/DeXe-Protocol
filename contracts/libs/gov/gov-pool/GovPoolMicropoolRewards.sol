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

    function cancelRewards(IGovPool.MicropoolInfo storage micropool, uint256 proposalId) external {
        delete micropool.pendingRewards[proposalId];
    }

    function saveDelegationInfo(
        mapping(bool => IGovPool.MicropoolInfo) storage micropoolPair,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address delegatee
    ) external {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        uint256 delegatedAmount = IGovUserKeeper(userKeeper).getDelegatedAmountBySnapshot(
            proposals[proposalId].core.nftPowerSnapshotId,
            msg.sender,
            delegatee
        );

        _saveDelegationInfo(micropoolPair[true], delegatee, delegatedAmount);

        /// TODO: only if there are actions against
        _saveDelegationInfo(micropoolPair[false], delegatee, delegatedAmount);
    }

    function _saveDelegationInfo(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee,
        uint256 delegatedAmount
    ) internal {
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
