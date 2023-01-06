// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolRewards {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TokenBalance for address;
    using MathHelper for uint256;

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);
    event RewardCredited(uint256 proposalId, uint256 amount, address sender);

    function updateRewards(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        uint256 proposalId,
        uint256 amount,
        uint256 coefficient
    ) external {
        address nftMultiplier = IGovPool(address(this)).nftMultiplier();
        uint256 amountToAdd = amount.ratio(coefficient, PRECISION);

        if (nftMultiplier != address(0)) {
            amountToAdd += IERC721Multiplier(nftMultiplier).getExtraRewards(
                msg.sender,
                amountToAdd
            );
        }

        IGovPool.PendingRewards storage userRewards = pendingRewards[msg.sender];

        if (proposalId != 0) {
            userRewards.onchainRewards[proposalId] += amountToAdd;
        } else {
            (address settingsAddress, , , ) = IGovPool(address(this)).getHelperContracts();

            address rewardToken = IGovSettings(settingsAddress).getInternalSettings().rewardToken;

            userRewards.offchainRewards[rewardToken] += amountToAdd;
            userRewards.offchainTokens.add(rewardToken);
        }

        emit RewardCredited(proposalId, amountToAdd, msg.sender);
    }

    function claimReward(
        mapping(address => IGovPool.PendingRewards) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.PendingRewards storage userRewards = pendingRewards[msg.sender];

        if (proposalId != 0) {
            require(proposals[proposalId].core.executed, "Gov: proposal is not executed");

            address rewardToken = proposals[proposalId].core.settings.rewardToken;
            uint256 rewards = userRewards.onchainRewards[proposalId];

            delete userRewards.onchainRewards[proposalId];

            _sendRewards(proposalId, rewardToken, rewards);
        } else {
            uint256 length = userRewards.offchainTokens.length();

            for (uint256 i = length; i > 0; i--) {
                address rewardToken = userRewards.offchainTokens.at(i - 1);
                uint256 rewards = userRewards.offchainRewards[rewardToken];

                delete userRewards.offchainRewards[rewardToken];
                userRewards.offchainTokens.remove(rewardToken);

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
            if (!proposals[proposalIds[i]].core.executed) {
                continue;
            }

            rewards.onchainRewards[i] = userRewards.onchainRewards[proposalIds[i]];
        }

        for (uint256 i = 0; i < rewards.offchainTokens.length; i++) {
            address token = userRewards.offchainTokens.at(i);

            rewards.offchainTokens[i] = token;
            rewards.offchainRewards[i] = userRewards.offchainRewards[token];
        }
    }

    function _sendRewards(uint256 proposalId, address rewardToken, uint256 rewards) internal {
        require(rewardToken != address(0), "Gov: rewards are off");
        require(rewardToken.normThisBalance() >= rewards, "Gov: not enough balance");

        rewardToken.sendFunds(msg.sender, rewards);

        emit RewardClaimed(proposalId, msg.sender, rewardToken, rewards);
    }
}
