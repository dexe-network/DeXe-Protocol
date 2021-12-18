// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/trader/ITraderPoolInvestProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../libs/MathHelper.sol";
import "../../libs/DecimalsConverter.sol";

import "../../trader/TraderPoolInvestProposal.sol";

library TraderPoolInvestProposalView {
    using EnumerableSet for EnumerableSet.UintSet;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using Address for address;

    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lp2Balance;
        uint256 lpInvested;
        uint256 reward;
    }

    struct Receptions {
        uint256 baseAmount;
        uint256[] receivedBaseAmounts; // should be used as minAmountOut
    }

    function getProposalInfos(
        mapping(uint256 => ITraderPoolInvestProposal.ProposalInfo) storage proposalInfos,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolInvestProposal.ProposalInfo[] memory proposals) {
        uint256 to = (offset + limit)
            .min(TraderPoolInvestProposal(address(this)).proposalsTotalNum())
            .max(offset);

        proposals = new ITraderPoolInvestProposal.ProposalInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            proposals[i - offset] = proposalInfos[i];
        }
    }

    function getActiveInvestmentsInfo(
        EnumerableSet.UintSet storage activeInvestments,
        mapping(uint256 => ITraderPoolInvestProposal.ProposalInfo) storage proposalInfos,
        mapping(address => mapping(uint256 => uint256)) storage lpBalances,
        mapping(address => mapping(uint256 => ITraderPoolInvestProposal.RewardInfo))
            storage rewardInfos,
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(activeInvestments.length()).max(offset);
        investments = new ActiveInvestmentInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = activeInvestments.at(i);
            uint256 balance = TraderPoolInvestProposal(address(this)).balanceOf(user, proposalId);

            TraderPoolInvestProposal.RewardInfo storage rewardInfo = rewardInfos[user][proposalId];

            uint256 reward = rewardInfo.rewardStored +
                ((proposalInfos[proposalId].cumulativeSum - rewardInfo.cumulativeSumStored) *
                    balance) /
                PRECISION;

            investments[i - offset] = ActiveInvestmentInfo(
                proposalId,
                balance,
                lpBalances[user][proposalId],
                reward
            );
        }
    }

    function getRewards(
        mapping(uint256 => ITraderPoolInvestProposal.ProposalInfo) storage proposalInfos,
        mapping(address => mapping(uint256 => ITraderPoolInvestProposal.RewardInfo))
            storage rewardInfos,
        uint256[] calldata proposalIds,
        address user
    ) external view returns (Receptions memory receptions) {
        uint256 proposalsTotalNum = TraderPoolInvestProposal(address(this)).proposalsTotalNum();
        receptions.receivedBaseAmounts = new uint256[](proposalIds.length);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposalId > proposalsTotalNum) {
                continue;
            }

            TraderPoolInvestProposal.RewardInfo storage rewardInfo = rewardInfos[user][proposalId];

            receptions.receivedBaseAmounts[i] =
                rewardInfo.rewardStored +
                ((proposalInfos[proposalId].cumulativeSum - rewardInfo.cumulativeSumStored) *
                    TraderPoolInvestProposal(address(this)).balanceOf(user, proposalId)) /
                PRECISION;
            receptions.baseAmount += receptions.receivedBaseAmounts[i];
        }
    }
}
