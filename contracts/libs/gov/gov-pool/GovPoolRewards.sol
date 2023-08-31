// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);
    event RewardCredited(
        uint256 proposalId,
        IGovPool.RewardType rewardType,
        address rewardToken,
        uint256 amount,
        address sender
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

        uint256 amountToAdd = _getMultipliedRewards(
            user,
            rewardType == IGovPool.RewardType.Create
                ? rewardsInfo.creationReward
                : rewardsInfo.executionReward
        );

        userInfos[user].pendingRewards.onchainRewards[proposalId] += amountToAdd;

        core.givenRewards += amountToAdd;

        emit RewardCredited(proposalId, rewardType, rewardsInfo.rewardToken, amountToAdd, user);
    }

    function updateOffchainRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        uint256 proposalId,
        address user
    ) external {
        (address govSettings, , , , ) = IGovPool(address(this)).getHelperContracts();

        IGovSettings.RewardsInfo memory rewardsInfo = IGovSettings(govSettings)
            .getInternalSettings()
            .rewardsInfo;

        uint256 amountToAdd = _getMultipliedRewards(user, rewardsInfo.executionReward);

        address rewardToken = rewardsInfo.rewardToken;

        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        userRewards.offchainRewards[rewardToken] += amountToAdd;
        userRewards.offchainTokens.add(rewardToken);

        emit RewardCredited(
            proposalId,
            IGovPool.RewardType.SaveOffchainResults,
            rewardToken,
            amountToAdd,
            user
        );
    }

    function updateVotingRewards(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId,
        address user
    ) external returns (uint256 delegatorRewards) {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        if (userRewards.areVotingRewardsSet[proposalId]) {
            return 0;
        }

        uint256 votingRewards;
        (votingRewards, delegatorRewards) = _getVotingRewards(core, userInfos, proposalId, user);

        if (votingRewards == 0 && delegatorRewards == 0) {
            return 0;
        }

        userRewards.onchainRewards[proposalId] += votingRewards;
        userRewards.areVotingRewardsSet[proposalId] = true;

        emit RewardCredited(
            proposalId,
            IGovPool.RewardType.Vote,
            core.settings.rewardsInfo.rewardToken,
            votingRewards,
            user
        );
    }

    function claimReward(
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.PendingRewards storage userRewards = userInfos[msg.sender].pendingRewards;

        if (proposalId != 0) {
            IGovPool.ProposalCore storage core = proposals[proposalId].core;

            require(core.executionTime != 0, "Gov: proposal is not executed");

            mapping(uint256 => uint256) storage onchainRewards = userRewards.onchainRewards;

            uint256 rewards = onchainRewards[proposalId];

            delete onchainRewards[proposalId];

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
        mapping(address => IGovPool.UserInfo) storage userInfos,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        address user,
        uint256[] calldata proposalIds
    ) external view returns (IGovPool.PendingRewardsView memory rewards) {
        IGovPool.PendingRewards storage userRewards = userInfos[user].pendingRewards;

        uint256 tokensLength = userRewards.offchainTokens.length();

        rewards.onchainRewards = new uint256[](proposalIds.length);
        rewards.offchainRewards = new uint256[](tokensLength);
        rewards.offchainTokens = new address[](tokensLength);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.ProposalCore storage core = proposals[proposalId].core;

            if (core.executionTime == 0) {
                continue;
            }

            rewards.onchainRewards[i] = userRewards.onchainRewards[proposalId];

            if (!userRewards.areVotingRewardsSet[proposalId]) {
                (uint256 votingRewards, ) = _getVotingRewards(core, userInfos, proposalId, user);

                rewards.onchainRewards[i] += votingRewards;
            }
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
    ) internal view returns (uint256 votingRewards, uint256 delegatorRewards) {
        IGovPool.VoteInfo storage voteInfo = userInfos[user].voteInfos[proposalId];

        IGovPool.ProposalState executedState = voteInfo.isVoteFor
            ? IGovPool.ProposalState.ExecutedFor
            : IGovPool.ProposalState.ExecutedAgainst;

        if (
            IGovPool(address(this)).getProposalState(proposalId) != executedState ||
            voteInfo.totalRawVoted == 0
        ) {
            return (0, 0);
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
    ) internal view returns (uint256 votingRewards, uint256 delegatorRewards) {
        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        uint256 personalRewards = rawVotes[IGovPool.VoteType.PersonalVote].totalVoted;
        uint256 micropoolRewards = rawVotes[IGovPool.VoteType.MicropoolVote].totalVoted;
        uint256 treasuryRewards = rawVotes[IGovPool.VoteType.TreasuryVote].totalVoted;
        uint256 totalRawVoted = voteInfo.totalRawVoted;

        (uint256 micropoolPercentage, uint256 treasuryPercentage) = ICoreProperties(
            IGovPool(address(this)).coreProperties()
        ).getVoteRewardsPercentages();

        personalRewards = _getMultipliedRewards(
            user,
            totalRewards.ratio(personalRewards, totalRawVoted)
        );
        micropoolRewards = totalRewards.ratio(micropoolRewards, totalRawVoted);
        treasuryRewards = totalRewards.ratio(treasuryRewards, totalRawVoted).percentage(
            treasuryPercentage
        );

        delegatorRewards = micropoolRewards - micropoolRewards.percentage(micropoolPercentage);
        votingRewards = personalRewards + micropoolRewards + treasuryRewards - delegatorRewards;
    }
}
