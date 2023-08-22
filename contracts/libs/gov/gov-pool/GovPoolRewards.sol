// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../../interfaces/core/ICoreProperties.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/ERC721/IERC721Multiplier.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

library GovPoolRewards {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TokenBalance for address;
    using MathHelper for uint256;

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);
    event RewardCredited(
        uint256 proposalId,
        IGovPool.RewardType rewardType,
        address rewardToken,
        uint256 amount,
        address sender
    );
    event RewardCanceled(uint256 proposalId, address rewardToken, uint256 amount, address sender);

    function updateRewards(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user,
        IGovPool.RewardType rewardType,
        uint256 amount
    ) public {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovSettings.RewardsInfo storage rewardsInfo = core.settings.rewardsInfo;

        uint256 amountToAdd = _calculateRewardForVoting(rewardsInfo, rewardType, amount);

        (address nftMultiplier, , , ) = IGovPool(address(this)).getNftContracts();

        if (
            rewardType != IGovPool.RewardType.VoteForDelegated &&
            rewardType != IGovPool.RewardType.VoteForTreasury &&
            rewardType != IGovPool.RewardType.VoteAgainstDelegated &&
            rewardType != IGovPool.RewardType.VoteAgainstTreasury &&
            nftMultiplier != address(0)
        ) {
            amountToAdd += IERC721Multiplier(nftMultiplier).getExtraRewards(user, amountToAdd);
        }

        IGovPool.PendingRewards storage userRewards = pendingRewards[user];

        address rewardToken;

        if (proposalId != 0) {
            rewardToken = rewardsInfo.rewardToken;

            if (
                rewardType == IGovPool.RewardType.Create ||
                rewardType == IGovPool.RewardType.Execute
            ) {
                userRewards.staticRewards[proposalId] += amountToAdd;
            } else {
                userRewards.votingRewards[proposalId] += amountToAdd;
            }

            core.givenRewards += amountToAdd;
        } else {
            (address settingsAddress, , , , ) = IGovPool(address(this)).getHelperContracts();

            rewardToken = IGovSettings(settingsAddress)
                .getInternalSettings()
                .rewardsInfo
                .rewardToken;

            userRewards.offchainRewards[rewardToken] += amountToAdd;
            userRewards.offchainTokens.add(rewardToken);
        }

        emit RewardCredited(proposalId, rewardType, rewardToken, amountToAdd, user);
    }

    function cancelVotingRewards(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        uint256 amountToCancel = pendingRewards[user].votingRewards[proposalId];

        delete pendingRewards[user].votingRewards[proposalId];

        core.givenRewards -= amountToCancel;

        emit RewardCanceled(
            proposalId,
            core.settings.rewardsInfo.rewardToken,
            amountToCancel,
            user
        );
    }

    function claimReward(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.PendingRewards storage userRewards = pendingRewards[msg.sender];

        if (proposalId != 0) {
            IGovPool.ProposalCore storage core = proposals[proposalId].core;

            require(core.executionTime != 0, "Gov: proposal is not executed");

            mapping(uint256 => uint256) storage staticRewards = userRewards.staticRewards;
            mapping(uint256 => uint256) storage votingRewards = userRewards.votingRewards;

            uint256 rewards = staticRewards[proposalId] + votingRewards[proposalId];

            delete staticRewards[proposalId];
            delete votingRewards[proposalId];

            _sendRewards(proposalId, core.settings.rewardsInfo.rewardToken, rewards);
        } else {
            EnumerableSet.AddressSet storage offchainTokens = userRewards.offchainTokens;
            mapping(address => uint256) storage offchainRewards = userRewards.offchainRewards;

            uint256 length = offchainTokens.length();

            for (uint256 i = length; i > 0; i--) {
                address rewardToken = offchainTokens.at(i - 1);
                uint256 rewards = offchainRewards[rewardToken];

                delete offchainRewards[rewardToken];
                offchainTokens.remove(rewardToken);

                _sendRewards(0, rewardToken, rewards);
            }
        }
    }

    function getPendingRewards(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        address user,
        uint256[] calldata proposalIds
    ) external view returns (IGovPool.PendingRewardsView memory rewards) {
        IGovPool.PendingRewards storage userRewards = pendingRewards[user];

        uint256 tokensLength = userRewards.offchainTokens.length();

        rewards.onchainRewards = new uint256[](proposalIds.length);
        rewards.offchainRewards = new uint256[](tokensLength);
        rewards.offchainTokens = new address[](tokensLength);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposals[proposalId].core.executionTime == 0) {
                continue;
            }

            rewards.onchainRewards[i] =
                userRewards.staticRewards[proposalId] +
                userRewards.votingRewards[proposalId];
        }

        for (uint256 i = 0; i < rewards.offchainTokens.length; i++) {
            address token = userRewards.offchainTokens.at(i);

            rewards.offchainTokens[i] = token;
            rewards.offchainRewards[i] = userRewards.offchainRewards[token];
        }
    }

    function _sendRewards(uint256 proposalId, address rewardToken, uint256 rewards) internal {
        require(rewardToken != address(0), "Gov: rewards are off");

        rewardToken.sendFunds(msg.sender, rewards, TokenBalance.TransferType.Mint);

        emit RewardClaimed(proposalId, msg.sender, rewardToken, rewards);
    }

    function _calculateRewardForVoting(
        IGovSettings.RewardsInfo storage rewardsInfo,
        IGovPool.RewardType rewardType,
        uint256 amount
    ) internal view returns (uint256) {
        if (rewardType == IGovPool.RewardType.Execute) {
            return rewardsInfo.executionReward;
        }

        if (rewardType == IGovPool.RewardType.Create) {
            return rewardsInfo.creationReward;
        }

        if (rewardType == IGovPool.RewardType.SaveOffchainResults) {
            (address govSettings, , , , ) = IGovPool(address(this)).getHelperContracts();

            return IGovSettings(govSettings).getInternalSettings().rewardsInfo.executionReward;
        }

        if (
            rewardType == IGovPool.RewardType.VoteForDelegated ||
            rewardType == IGovPool.RewardType.VoteAgainstDelegated
        ) {
            (uint256 percentage, ) = ICoreProperties(IGovPool(address(this)).coreProperties())
                .getVoteRewardsPercentages();

            amount = amount.percentage(percentage);
        }

        if (
            rewardType == IGovPool.RewardType.VoteForTreasury ||
            rewardType == IGovPool.RewardType.VoteAgainstTreasury
        ) {
            (, uint256 percentage) = ICoreProperties(IGovPool(address(this)).coreProperties())
                .getVoteRewardsPercentages();

            amount = amount.percentage(percentage);
        }

        if (
            rewardType == IGovPool.RewardType.VoteFor ||
            rewardType == IGovPool.RewardType.VoteForDelegated ||
            rewardType == IGovPool.RewardType.VoteForTreasury
        ) {
            return amount.ratio(rewardsInfo.voteForRewardsCoefficient, PRECISION);
        }

        return amount.ratio(rewardsInfo.voteAgainstRewardsCoefficient, PRECISION);
    }
}
