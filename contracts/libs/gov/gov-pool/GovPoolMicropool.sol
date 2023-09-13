// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/arrays/ArrayHelper.sol";

import "./GovPoolRewards.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolMicropool {
    using TokenBalance for address;
    using Math for uint256;
    using MathHelper for uint256;
    using ArrayHelper for uint256[];
    using GovPoolRewards for *;

    event DelegatorRewardsClaimed(
        uint256 proposalId,
        address delegator,
        address delegatee,
        address token,
        uint256 amount
    );

    function saveDelegationInfo(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        address delegatee
    ) external {
        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 currentTokenAmount, uint256[] memory currentNftIds) = IGovUserKeeper(userKeeper)
            .getDelegatedAssets(msg.sender, delegatee);

        IGovPool.DelegatorInfo storage delegatorInfo = userInfos[delegatee]
            .micropoolInfo
            .delegatorInfos[msg.sender];

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
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address delegatee
    ) external {
        uint256 reward = _getExpectedRewards(
            userInfos,
            proposals,
            proposalId,
            msg.sender,
            delegatee
        );

        require(reward != 0, "Gov: no micropool rewards");

        userInfos[delegatee].micropoolInfo.delegatorInfos[msg.sender].isClaimed[proposalId] = true;

        address rewardToken = proposals[proposalId].core.settings.rewardsInfo.rewardToken;

        rewardToken.sendFunds(msg.sender, reward, TokenBalance.TransferType.TryMint);

        emit DelegatorRewardsClaimed(proposalId, msg.sender, delegatee, rewardToken, reward);
    }

    function getDelegatorRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view returns (IGovPool.DelegatorRewards memory rewards) {
        rewards.expectedRewards = new uint256[](proposalIds.length);
        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.isVoteFor = new bool[](proposalIds.length);
        rewards.isClaimed = new bool[](proposalIds.length);

        IGovPool.UserInfo storage userInfo = userInfos[delegatee];

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.Proposal storage proposal = proposals[proposalId];

            if (!proposal.core.executed) {
                continue;
            }

            rewards.expectedRewards[i] = _getExpectedRewards(
                userInfos,
                proposals,
                proposalId,
                delegator,
                delegatee
            );
            rewards.rewardTokens[i] = proposal.core.settings.rewardsInfo.rewardToken;
            rewards.isVoteFor[i] = userInfo.voteInfos[proposalId].isVoteFor;
            rewards.isClaimed[i] = userInfo.micropoolInfo.delegatorInfos[delegator].isClaimed[
                proposalId
            ];
        }
    }

    function _getExpectedRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address delegator,
        address delegatee
    ) private view returns (uint256) {
        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.UserInfo storage userInfo = userInfos[delegatee];
        IGovPool.RawVote storage micropoolRawVote = userInfo.voteInfos[proposalId].rawVotes[
            IGovPool.VoteType.MicropoolVote
        ];
        IGovPool.DelegatorInfo storage delegatorInfo = userInfo.micropoolInfo.delegatorInfos[
            delegator
        ];

        (, uint256 delegatorsRewards) = core._getVotingRewards(userInfos, proposalId, delegatee);

        if (!core.executed || delegatorInfo.isClaimed[proposalId] || delegatorsRewards == 0) {
            return 0;
        }

        uint256 quorumReachedTime = core.executeAfter - core.settings.executionDelay;
        uint256 index = delegatorInfo.delegationTimes.lowerBound(quorumReachedTime);

        if (index == 0) {
            return 0;
        }

        --index;

        uint256 delegationAmount = delegatorInfo.tokenAmounts[index] +
            IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
                delegatorInfo.nftIds[index],
                core.nftPowerSnapshotId
            );

        return delegatorsRewards.ratio(delegationAmount, micropoolRawVote.totalVoted);
    }
}
