// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../../interfaces/core/ICoreProperties.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/ERC721/multipliers/IAbstractERC721Multiplier.sol";

import "../../utils/TokenBalance.sol";
import "../../math/MathHelper.sol";

library GovPoolRewards {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TokenBalance for address;
    using MathHelper for uint256;

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 rewards);
    event VotingRewardClaimed(
        uint256 proposalId,
        address sender,
        address token,
        IGovPool.VotingRewards rewards
    );

    function updateStaticRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user,
        IGovPool.RewardType rewardType
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovSettings.RewardsInfo storage rewardsInfo = core.settings.rewardsInfo;

        uint256 amountToAdd = rewardType == IGovPool.RewardType.Create
            ? rewardsInfo.creationReward
            : rewardsInfo.executionReward;

        userInfos[user].pendingRewards.staticRewards[proposalId] += amountToAdd;

        core.givenRewards += amountToAdd;
    }

    function updateOffchainRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        address user
    ) external {
        (address govSettings, , , , ) = IGovPool(address(this)).getHelperContracts();

        IGovSettings.RewardsInfo memory rewardsInfo = IGovSettings(govSettings)
            .getInternalSettings()
            .rewardsInfo;

        address rewardToken = rewardsInfo.rewardToken;

        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        userRewards.offchainRewards[rewardToken] += rewardsInfo.executionReward;
        userRewards.offchainTokens.add(rewardToken);
    }

    function updateVotingRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        if (userRewards.areVotingRewardsSet[proposalId]) {
            return;
        }

        (IGovPool.VotingRewards memory votingRewards, ) = _getVotingRewards(
            core,
            userInfos,
            proposalId,
            user
        );

        if (votingRewards.personal + votingRewards.micropool + votingRewards.treasury == 0) {
            return;
        }

        userRewards.votingRewards[proposalId] = votingRewards;
        userRewards.areVotingRewardsSet[proposalId] = true;
    }

    function claimReward(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user
    ) external {
        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        if (proposalId != 0) {
            IGovPool.ProposalCore storage core = proposals[proposalId].core;

            require(core.executed, "Gov: proposal is not executed");

            uint256 staticRewards = userRewards.staticRewards[proposalId];
            IGovPool.VotingRewards memory votingRewards = userRewards.votingRewards[proposalId];

            delete userRewards.staticRewards[proposalId];
            delete userRewards.votingRewards[proposalId];

            address rewardToken = core.settings.rewardsInfo.rewardToken;

            _sendRewards(
                user,
                core.settings.rewardsInfo.rewardToken,
                staticRewards +
                    votingRewards.personal +
                    votingRewards.micropool +
                    votingRewards.treasury
            );

            emit RewardClaimed(proposalId, user, rewardToken, staticRewards);
            emit VotingRewardClaimed(proposalId, user, rewardToken, votingRewards);
        } else {
            EnumerableSet.AddressSet storage offchainTokens = userRewards.offchainTokens;
            mapping(address => uint256) storage offchainRewards = userRewards.offchainRewards;

            uint256 length = offchainTokens.length();

            for (uint256 i = length; i > 0; i--) {
                address rewardToken = offchainTokens.at(i - 1);
                uint256 rewards = offchainRewards[rewardToken];

                delete offchainRewards[rewardToken];
                offchainTokens.remove(rewardToken);

                _sendRewards(user, rewardToken, rewards);

                emit RewardClaimed(0, user, rewardToken, rewards);
            }
        }
    }

    function getPendingRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        address user,
        uint256[] calldata proposalIds
    ) external view returns (IGovPool.PendingRewardsView memory rewards) {
        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        uint256 tokensLength = userRewards.offchainTokens.length();

        rewards.onchainTokens = new address[](proposalIds.length);
        rewards.staticRewards = new uint256[](proposalIds.length);
        rewards.votingRewards = new IGovPool.VotingRewards[](proposalIds.length);
        rewards.offchainRewards = new uint256[](tokensLength);
        rewards.offchainTokens = new address[](tokensLength);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.ProposalCore storage core = proposals[proposalId].core;

            if (!core.executed) {
                continue;
            }

            rewards.onchainTokens[i] = core.settings.rewardsInfo.rewardToken;
            rewards.staticRewards[i] = userRewards.staticRewards[proposalId];

            if (!userRewards.areVotingRewardsSet[proposalId]) {
                (rewards.votingRewards[i], ) = _getVotingRewards(
                    core,
                    userInfos,
                    proposalId,
                    user
                );
            } else {
                rewards.votingRewards[i] = userRewards.votingRewards[proposalId];
            }
        }

        for (uint256 i = 0; i < rewards.offchainTokens.length; i++) {
            address token = userRewards.offchainTokens.at(i);

            rewards.offchainTokens[i] = token;
            rewards.offchainRewards[i] = userRewards.offchainRewards[token];
        }
    }

    function _sendRewards(address receiver, address rewardToken, uint256 rewards) internal {
        require(rewardToken != address(0), "Gov: rewards are off");
        require(rewards != 0, "Gov: zero rewards");

        rewardToken.sendFunds(receiver, rewards, TokenBalance.TransferType.TryMint);
    }

    function _getMultipliedRewards(address user, uint256 amount) internal view returns (uint256) {
        (address nftMultiplier, , , ) = IGovPool(address(this)).getNftContracts();

        if (nftMultiplier != address(0)) {
            amount += IAbstractERC721Multiplier(nftMultiplier).getExtraRewards(user, amount);
        }

        return amount;
    }

    function _getVotingRewards(
        IGovPool.ProposalCore storage core,
        mapping(address => IGovPool.UserInfo) storage userInfos,
        uint256 proposalId,
        address user
    )
        internal
        view
        returns (IGovPool.VotingRewards memory votingRewards, uint256 delegatorsRewards)
    {
        IGovPool.VoteInfo storage voteInfo = userInfos[user].voteInfos[proposalId];

        IGovPool.ProposalState executedState = voteInfo.isVoteFor
            ? IGovPool.ProposalState.ExecutedFor
            : IGovPool.ProposalState.ExecutedAgainst;

        if (
            IGovPool(address(this)).getProposalState(proposalId) != executedState ||
            voteInfo.totalRawVoted == 0
        ) {
            return (votingRewards, 0);
        }

        return _splitVotingRewards(voteInfo, user, _getInitialVotingRewards(core, voteInfo));
    }

    function _getInitialVotingRewards(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo
    ) internal view returns (uint256) {
        (uint256 coreVotes, uint256 coreRawVotes) = voteInfo.isVoteFor
            ? (core.votesFor, core.rawVotesFor)
            : (core.votesAgainst, core.rawVotesAgainst);

        return
            coreRawVotes.ratio(core.settings.rewardsInfo.voteRewardsCoefficient, PRECISION).ratio(
                voteInfo.totalVoted,
                coreVotes
            );
    }

    function _splitVotingRewards(
        IGovPool.VoteInfo storage voteInfo,
        address user,
        uint256 totalRewards
    )
        internal
        view
        returns (IGovPool.VotingRewards memory votingRewards, uint256 delegatorsRewards)
    {
        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        uint256 personalRewards = rawVotes[IGovPool.VoteType.PersonalVote].totalVoted;
        uint256 micropoolRewards = rawVotes[IGovPool.VoteType.MicropoolVote].totalVoted;
        uint256 treasuryRewards = rawVotes[IGovPool.VoteType.TreasuryVote].totalVoted;
        uint256 totalRawVoted = voteInfo.totalRawVoted;

        (uint256 micropoolPercentage, uint256 treasuryPercentage) = ICoreProperties(
            IGovPool(address(this)).coreProperties()
        ).getVoteRewardsPercentages();

        votingRewards.personal = _getMultipliedRewards(
            user,
            totalRewards.ratio(personalRewards, totalRawVoted)
        );
        votingRewards.micropool = totalRewards.ratio(micropoolRewards, totalRawVoted);
        votingRewards.treasury = totalRewards.ratio(treasuryRewards, totalRawVoted).percentage(
            treasuryPercentage
        );

        delegatorsRewards = votingRewards.micropool.percentage(
            PERCENTAGE_100 - micropoolPercentage
        );

        votingRewards.micropool -= delegatorsRewards;
    }
}
