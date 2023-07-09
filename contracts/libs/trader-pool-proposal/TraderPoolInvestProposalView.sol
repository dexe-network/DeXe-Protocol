// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/trader/ITraderPoolInvestProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../price-feed/PriceFeedLocal.sol";
import "../../libs/math/MathHelper.sol";

import "../../trader/TraderPoolInvestProposal.sol";

library TraderPoolInvestProposalView {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathHelper for uint256;
    using Math for uint256;
    using PriceFeedLocal for IPriceFeed;

    function getProposalInfos(
        mapping(uint256 => ITraderPoolInvestProposal.ProposalInfo) storage proposalInfos,
        mapping(uint256 => EnumerableSet.AddressSet) storage investors,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolInvestProposal.ProposalInfoExtended[] memory proposals) {
        TraderPoolInvestProposal traderPoolInvestProposal = TraderPoolInvestProposal(
            address(this)
        );

        uint256 to = (offset + limit).min(traderPoolInvestProposal.proposalsTotalNum()).max(
            offset
        );

        proposals = new ITraderPoolInvestProposal.ProposalInfoExtended[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            ITraderPoolInvestProposal.ProposalInfoExtended memory proposalInfo = proposals[
                i - offset
            ];

            uint256 nextProposalId = i + 1;

            proposalInfo.proposalInfo = proposalInfos[nextProposalId];
            proposalInfo.lp2Supply = traderPoolInvestProposal.totalSupply(nextProposalId);
            proposalInfo.totalInvestors = investors[nextProposalId].length();
        }
    }

    function getActiveInvestmentsInfo(
        EnumerableSet.UintSet storage activeInvestments,
        mapping(address => mapping(uint256 => uint256)) storage baseBalances,
        mapping(address => mapping(uint256 => uint256)) storage lpBalances,
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolInvestProposal.ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(activeInvestments.length()).max(offset);
        investments = new ITraderPoolInvestProposal.ActiveInvestmentInfo[](to - offset);

        TraderPoolInvestProposal traderPoolInvestProposal = TraderPoolInvestProposal(
            address(this)
        );

        mapping(uint256 => uint256) storage baseBalance = baseBalances[user];
        mapping(uint256 => uint256) storage lpBalance = lpBalances[user];

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = activeInvestments.at(i);

            investments[i - offset] = ITraderPoolInvestProposal.ActiveInvestmentInfo(
                proposalId,
                traderPoolInvestProposal.balanceOf(user, proposalId),
                baseBalance[proposalId],
                lpBalance[proposalId]
            );
        }
    }

    function getRewards(
        mapping(uint256 => ITraderPoolInvestProposal.RewardInfo) storage rewardInfos,
        mapping(address => mapping(uint256 => ITraderPoolInvestProposal.UserRewardInfo))
            storage userRewardInfos,
        uint256[] calldata proposalIds,
        address user
    ) external view returns (ITraderPoolInvestProposal.Receptions memory receptions) {
        receptions.rewards = new ITraderPoolInvestProposal.Reception[](proposalIds.length);

        TraderPoolInvestProposal traderPoolInvestProposal = TraderPoolInvestProposal(
            address(this)
        );

        IPriceFeed priceFeed = traderPoolInvestProposal.priceFeed();
        uint256 proposalsTotalNum = traderPoolInvestProposal.proposalsTotalNum();
        address baseToken = traderPoolInvestProposal.getBaseToken();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposalId == 0 || proposalId > proposalsTotalNum) {
                continue;
            }

            ITraderPoolInvestProposal.UserRewardInfo storage userRewardInfo = userRewardInfos[
                user
            ][proposalId];
            ITraderPoolInvestProposal.RewardInfo storage rewardInfo = rewardInfos[proposalId];

            uint256 balance = traderPoolInvestProposal.balanceOf(user, proposalId);

            ITraderPoolInvestProposal.Reception memory reception = receptions.rewards[i];

            reception.tokens = rewardInfo.rewardTokens.values();
            reception.amounts = new uint256[](reception.tokens.length);

            for (uint256 j = 0; j < reception.tokens.length; j++) {
                address token = reception.tokens[j];

                reception.amounts[j] =
                    userRewardInfo.rewardsStored[token] +
                    (rewardInfo.cumulativeSums[token] - userRewardInfo.cumulativeSumsStored[token])
                        .ratio(balance, PRECISION);

                if (token == baseToken) {
                    receptions.totalBaseAmount += reception.amounts[j];
                    receptions.baseAmountFromRewards += reception.amounts[j];
                } else {
                    receptions.totalBaseAmount += priceFeed.getNormPriceOut(
                        token,
                        baseToken,
                        reception.amounts[j]
                    );
                }
            }

            (receptions.totalUsdAmount, ) = priceFeed.getNormalizedPriceOutUSD(
                baseToken,
                receptions.totalBaseAmount
            );
        }
    }
}
