// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolMicropool {
    using TokenBalance for address;
    using Math for uint256;
    using MathHelper for uint256;

    function updateRewards(
        IGovPool.MicropoolInfo storage micropool,
        uint256 proposalId,
        uint256 amount
    ) external {
        micropool.pendingRewards[proposalId] = amount;
    }

    function saveDelegationInfo(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) external {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 currentTokenAmount, uint256[] memory currentNftIds) = IGovUserKeeper(userKeeper)
            .getDelegatedAssets(msg.sender, delegatee);

        IGovPool.DelegatorInfo storage delegatorInfo = micropool.delegatorInfos[msg.sender];

        uint256[] storage delegationTimes = delegatorInfo.delegationTimes;
        uint256[] storage tokenAmounts = delegatorInfo.tokenAmounts;
        uint256[][] storage nftIds = delegatorInfo.nftIds;

        uint256 length = delegationTimes.length;

        if (length > 0 && delegationTimes[length - 1] == block.timestamp) {
            delegationTimes.pop();
            tokenAmounts.pop();
            nftIds.pop();
        }

        delegationTimes.push(block.timestamp);
        tokenAmounts.push(currentTokenAmount);
        nftIds.push(currentNftIds);
    }

    function claim(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address delegatee
    ) external {
        /// TODO: fix double spending
        uint256[] memory rewards = _getExpectedRewards(
            micropool,
            proposals,
            voteInfos,
            proposalIds,
            msg.sender,
            delegatee
        );

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 reward = rewards[i];

            require(reward != 0, "Gov: no micropool rewards");

            uint256 proposalId = proposalIds[i];

            micropool.delegatorInfos[msg.sender].isClaimed[proposalId] = true;

            address rewardToken = proposals[proposalId].core.settings.rewardsInfo.rewardToken;

            rewardToken.sendFunds(msg.sender, reward, TokenBalance.TransferType.TryMint);
        }
    }

    function getDelegatorRewards(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view returns (IGovPool.DelegatorRewards memory rewards) {
        rewards.expectedRewards = _getExpectedRewards(
            micropool,
            proposals,
            voteInfos,
            proposalIds,
            delegator,
            delegatee
        );

        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.isVoteFor = new bool[](proposalIds.length);
        rewards.executed = new bool[](proposalIds.length);
        rewards.isClaimed = new bool[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.Proposal storage proposal = proposals[proposalId];

            rewards.rewardTokens[i] = proposal.core.settings.rewardsInfo.rewardToken;
            rewards.isVoteFor[i] = voteInfos[proposalId][delegatee][
                IGovPool.VoteType.MicropoolVote
            ].isVoteFor;

            /// TODO: return rewards only for the executed proposals
            rewards.executed[i] = proposal.core.executionTime != 0;
            rewards.isClaimed[i] = micropool.delegatorInfos[delegator].isClaimed[proposalId];
        }
    }

    function _getExpectedRewards(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) private view returns (uint256[] memory rewards) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        rewards = new uint256[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.ProposalCore storage core = proposals[proposalId].core;
            IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][delegatee][
                IGovPool.VoteType.MicropoolVote
            ];
            IGovPool.DelegatorInfo storage delegatorInfo = micropool.delegatorInfos[delegator];

            uint256 pendingRewards = micropool.pendingRewards[proposalId];

            if (
                core.executionTime == 0 ||
                delegatorInfo.isClaimed[proposalId] ||
                pendingRewards == 0
            ) {
                continue;
            }

            (uint256 index, bool found) = _searchLastLess(
                delegatorInfo.delegationTimes,
                core.executionTime
            );

            if (!found) {
                continue;
            }

            uint256 delegationAmount = delegatorInfo.tokenAmounts[index] +
                IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
                    delegatorInfo.nftIds[index],
                    core.nftPowerSnapshotId
                );

            // TODO: use here nftPower + token instead of totalVoted
            rewards[i] = pendingRewards.ratio(delegationAmount, voteInfo.totalVoted);
        }
    }

    // TODO: use dlsl binary search
    function _searchLastLess(
        uint256[] storage array,
        uint256 element
    ) private view returns (uint256 index, bool found) {
        (uint256 low, uint256 high) = (0, array.length);

        while (low < high) {
            uint256 mid = (low + high) >> 1;

            if (array[mid] >= element) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        if (high == 0) {
            return (0, false);
        }

        return (high - 1, true);
    }
}
