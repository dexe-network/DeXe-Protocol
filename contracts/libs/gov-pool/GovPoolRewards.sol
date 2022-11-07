// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

library GovPoolRewards {
    using TokenBalance for address;
    using MathHelper for uint256;

    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);

    function updateRewards(
        mapping(uint256 => mapping(address => uint256)) storage pendingRewards,
        uint256 proposalId,
        uint256 amount,
        uint256 coefficient
    ) external {
        pendingRewards[proposalId][msg.sender] += amount.ratio(coefficient, PRECISION);
    }

    function claimReward(
        mapping(uint256 => mapping(address => uint256)) storage pendingRewards,
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        address rewardToken = proposals[proposalId].core.settings.rewardToken;

        require(rewardToken != address(0), "Gov: rewards off");
        require(proposals[proposalId].core.executed, "Gov: proposal not executed");

        uint256 rewards = pendingRewards[proposalId][msg.sender];

        IERC721Multiplier nftMultiplier = IGovPool(address(this)).nftMultiplier();

        if (address(nftMultiplier) != address(0)) {
            rewards = nftMultiplier.multiplyRewards(msg.sender, rewards);
        }

        require(rewardToken.normThisBalance() >= rewards, "Gov: not enough balance");

        delete pendingRewards[proposalId][msg.sender];

        rewardToken.sendFunds(msg.sender, rewards);

        emit RewardClaimed(proposalId, msg.sender, rewardToken, rewards);
    }
}
