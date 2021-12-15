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

    function getRewards(
        mapping(uint256 => ITraderPoolInvestProposal.ProposalInfo) storage proposalInfos,
        mapping(address => mapping(uint256 => ITraderPoolInvestProposal.RewardInfo))
            storage rewardInfos,
        uint256[] calldata proposalIds,
        address user
    ) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](proposalIds.length);

        uint256 proposalsTotalNum = TraderPoolInvestProposal(address(this)).proposalsTotalNum();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposalId > proposalsTotalNum) {
                continue;
            }

            TraderPoolInvestProposal.RewardInfo storage rewardInfo = rewardInfos[user][proposalId];

            amounts[i] =
                rewardInfos[user][proposalId].rewardStored +
                ((proposalInfos[proposalId].cumulativeSum - rewardInfo.cumulativeSumStored) *
                    TraderPoolInvestProposal(address(this)).balanceOf(user, proposalId)) /
                PRECISION;
        }
    }
}
