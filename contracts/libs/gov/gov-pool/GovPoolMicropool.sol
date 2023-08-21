// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/arrays/ArrayHelper.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolMicropool {
    using TokenBalance for address;
    using Math for uint256;
    using MathHelper for uint256;
    using ArrayHelper for uint256[];

    event MicropoolRewardClaimed(uint256 proposalId, address user, address token, uint256 amount);

    function updateRewards(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        uint256 amount,
        IGovPool.RewardType rewardType
    ) external {
        IGovSettings.RewardsInfo storage rewardsInfo = proposals[proposalId]
            .core
            .settings
            .rewardsInfo;

        (uint256 percentage, ) = ICoreProperties(IGovPool(address(this)).coreProperties())
            .getVoteRewardsPercentages();

        amount -= amount.percentage(percentage);

        micropool.pendingRewards[proposalId] = rewardType == IGovPool.RewardType.VoteForDelegated
            ? amount.ratio(rewardsInfo.voteForRewardsCoefficient, PRECISION)
            : amount.ratio(rewardsInfo.voteAgainstRewardsCoefficient, PRECISION);

        micropool.pendingRewards[proposalId] = amount;
    }

    function saveDelegationInfo(
        IGovPool.MicropoolInfo storage micropool,
        address delegatee
    ) external {
        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

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
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        uint256[] calldata proposalIds,
        address delegatee
    ) external {
        for (uint256 i; i < proposalIds.length; i++) {
            uint256 reward = _getExpectedRewards(
                micropool,
                proposals,
                voteInfos,
                proposalIds[i],
                msg.sender,
                delegatee
            );

            require(reward != 0, "Gov: no micropool rewards");

            uint256 proposalId = proposalIds[i];

            micropool.delegatorInfos[msg.sender].isClaimed[proposalId] = true;

            address rewardToken = proposals[proposalId].core.settings.rewardsInfo.rewardToken;

            rewardToken.sendFunds(msg.sender, reward, TokenBalance.TransferType.TryMint);

            emit MicropoolRewardClaimed(proposalId, msg.sender, rewardToken, reward);
        }
    }

    function getDelegatorRewards(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view returns (IGovPool.DelegatorRewards memory rewards) {
        rewards.expectedRewards = new uint256[](proposalIds.length);
        rewards.rewardTokens = new address[](proposalIds.length);
        rewards.isVoteFor = new bool[](proposalIds.length);
        rewards.isClaimed = new bool[](proposalIds.length);

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.Proposal storage proposal = proposals[proposalId];

            if (proposal.core.executionTime == 0) {
                continue;
            }

            rewards.expectedRewards[i] = _getExpectedRewards(
                micropool,
                proposals,
                voteInfos,
                proposalId,
                delegator,
                delegatee
            );
            rewards.rewardTokens[i] = proposal.core.settings.rewardsInfo.rewardToken;
            rewards.isVoteFor[i] = voteInfos[proposalId][delegatee].isVoteFor;
            rewards.isClaimed[i] = micropool.delegatorInfos[delegator].isClaimed[proposalId];
        }
    }

    function _getExpectedRewards(
        IGovPool.MicropoolInfo storage micropool,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        uint256 proposalId,
        address delegator,
        address delegatee
    ) private view returns (uint256) {
        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VotePower storage micropoolPower = voteInfos[proposalId][delegatee].votePowers[
            IGovPool.VoteType.MicropoolVote
        ];
        IGovPool.DelegatorInfo storage delegatorInfo = micropool.delegatorInfos[delegator];

        uint256 pendingRewards = micropool.pendingRewards[proposalId];

        if (
            core.executionTime == 0 || delegatorInfo.isClaimed[proposalId] || pendingRewards == 0
        ) {
            return 0;
        }

        uint256 index = delegatorInfo.delegationTimes.lowerBound(core.executionTime);

        if (index == 0) {
            return 0;
        }

        --index;

        uint256 delegationAmount = delegatorInfo.tokenAmounts[index] +
            IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
                delegatorInfo.nftIds[index],
                core.nftPowerSnapshotId
            );

        return pendingRewards.ratio(delegationAmount, micropoolPower.powerVoted);
    }
}
