// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolRewards {
    using TokenBalance for address;
    using MathHelper for uint256;

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);
    event RewardCredited(uint256 proposalId, uint256 amount, address sender);

    function updateRewards(
        mapping(uint256 => mapping(address => uint256)) storage pendingRewards,
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

        pendingRewards[proposalId][msg.sender] += amountToAdd;

        emit RewardCredited(proposalId, amountToAdd, msg.sender);
    }

    function claimReward(
        mapping(uint256 => mapping(address => uint256)) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        address rewardToken = proposals[proposalId].core.settings.rewardToken;

        require(rewardToken != address(0), "Gov: rewards are off");
        require(proposals[proposalId].core.executed, "Gov: proposal is not executed");

        uint256 rewards = pendingRewards[proposalId][msg.sender];

        require(rewardToken.normThisBalance() >= rewards, "Gov: not enough balance");

        delete pendingRewards[proposalId][msg.sender];

        rewardToken.sendFunds(msg.sender, rewards);

        emit RewardClaimed(proposalId, msg.sender, rewardToken, rewards);
    }
}
