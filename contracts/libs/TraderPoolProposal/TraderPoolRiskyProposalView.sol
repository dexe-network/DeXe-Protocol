// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../MathHelper.sol";
import "../DecimalsConverter.sol";
import "../PriceFeed/PriceFeedLocal.sol";

import "../../trader/TraderPoolRiskyProposal.sol";

library TraderPoolRiskyProposalView {
    using EnumerableSet for EnumerableSet.UintSet;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using Address for address;
    using PriceFeedLocal for IPriceFeed;

    function getProposalInfos(
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolRiskyProposal.ProposalInfoExtended[] memory proposals) {
        uint256 to = (offset + limit)
            .min(TraderPoolRiskyProposal(address(this)).proposalsTotalNum())
            .max(offset);

        proposals = new ITraderPoolRiskyProposal.ProposalInfoExtended[](to - offset);

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();
        address baseToken = ITraderPoolRiskyProposal(address(this)).getBaseToken();

        for (uint256 i = offset; i < to; i++) {
            proposals[i - offset].proposalInfo = proposalInfos[i + 1];

            proposals[i - offset].totalProposalBase =
                proposals[i - offset].proposalInfo.balanceBase +
                priceFeed.getNormPriceOut(
                    proposals[i - offset].proposalInfo.token,
                    baseToken,
                    proposals[i - offset].proposalInfo.balancePosition
                );
            (proposals[i - offset].totalProposalUSD, ) = priceFeed.getNormalizedPriceOutUSD(
                baseToken,
                proposals[i - offset].totalProposalBase
            );
            proposals[i - offset].lp2Supply = TraderPoolRiskyProposal(address(this)).totalSupply(
                i + 1
            );
        }
    }

    function getActiveInvestmentsInfo(
        EnumerableSet.UintSet storage activeInvestments,
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        mapping(address => mapping(uint256 => uint256)) storage lpBalances,
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolRiskyProposal.ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(activeInvestments.length()).max(offset);

        investments = new ITraderPoolRiskyProposal.ActiveInvestmentInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = activeInvestments.at(i);
            uint256 balance = TraderPoolRiskyProposal(address(this)).balanceOf(user, proposalId);
            uint256 supply = TraderPoolRiskyProposal(address(this)).totalSupply(proposalId);

            uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(balance, supply);
            uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(
                balance,
                supply
            );

            investments[i - offset] = ITraderPoolRiskyProposal.ActiveInvestmentInfo(
                proposalId,
                balance,
                lpBalances[user][proposalId],
                baseShare,
                positionShare
            );
        }
    }

    function getUserInvestmentsLimits(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        mapping(address => mapping(uint256 => uint256)) storage lpBalances,
        address user,
        uint256[] calldata proposalIds
    ) external view returns (uint256[] memory lps) {
        lps = new uint256[](proposalIds.length);

        ITraderPoolRiskyProposal proposal = ITraderPoolRiskyProposal(address(this));
        address trader = parentTraderPoolInfo.trader;

        uint256 lpBalance = proposal.totalLPBalances(user) +
            IERC20(parentTraderPoolInfo.parentPoolAddress).balanceOf(user);

        for (uint256 i = 0; i < proposalIds.length; i++) {
            if (user != trader) {
                uint256 proposalId = proposalIds[i];

                uint256 maxPercentage = proposal.getInvestmentPercentage(proposalId, trader, 0);
                uint256 maxInvestment = lpBalance.percentage(maxPercentage);

                lps[i] = maxInvestment > lpBalances[user][proposalId]
                    ? maxInvestment - lpBalances[user][proposalId]
                    : 0;
            } else {
                lps[i] = MAX_UINT;
            }
        }
    }

    function getCreationTokens(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        address token,
        uint256 baseToExchange,
        address[] calldata optionalPath
    )
        external
        view
        returns (
            uint256 positionTokens,
            uint256 positionTokenPrice,
            address[] memory path
        )
    {
        address baseToken = parentTraderPoolInfo.baseToken;

        if (!token.isContract() || token == baseToken) {
            return (0, 0, new address[](0));
        }

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();

        (positionTokens, path) = priceFeed.getNormalizedExtendedPriceOut(
            baseToken,
            token,
            baseToExchange,
            optionalPath
        );
        (positionTokenPrice, ) = priceFeed.getNormalizedExtendedPriceIn(
            baseToken,
            token,
            DECIMALS,
            optionalPath
        );
    }

    function getInvestTokens(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        ITraderPoolRiskyProposal.ProposalInfo storage info,
        uint256 proposalId,
        uint256 baseInvestment
    )
        external
        view
        returns (
            uint256 baseAmount,
            uint256 positionAmount,
            uint256 lp2Amount
        )
    {
        if (proposalId > TraderPoolRiskyProposal(address(this)).proposalsTotalNum()) {
            return (0, 0, 0);
        }

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();
        uint256 tokensPrice = priceFeed.getNormPriceOut(
            info.token,
            parentTraderPoolInfo.baseToken,
            info.balancePosition
        );
        uint256 totalBase = tokensPrice + info.balanceBase;

        lp2Amount = baseInvestment;
        baseAmount = baseInvestment;

        if (totalBase > 0) {
            uint256 baseToExchange = baseInvestment.ratio(tokensPrice, totalBase);

            baseAmount = baseInvestment - baseToExchange;
            positionAmount = priceFeed.getNormPriceOut(
                parentTraderPoolInfo.baseToken,
                info.token,
                baseToExchange
            );
            lp2Amount = lp2Amount.ratio(
                TraderPoolRiskyProposal(address(this)).totalSupply(proposalId),
                totalBase
            );
        }
    }

    function getDivestAmounts(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        uint256[] calldata proposalIds,
        uint256[] calldata lp2s
    ) external view returns (ITraderPoolRiskyProposal.Receptions memory receptions) {
        receptions.positions = new address[](proposalIds.length);
        receptions.givenAmounts = new uint256[](proposalIds.length);
        receptions.receivedAmounts = new uint256[](proposalIds.length);

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();
        uint256 proposalsTotalNum = TraderPoolRiskyProposal(address(this)).proposalsTotalNum();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposalId > proposalsTotalNum) {
                continue;
            }

            uint256 propSupply = TraderPoolRiskyProposal(address(this)).totalSupply(proposalId);

            if (propSupply > 0) {
                receptions.positions[i] = proposalInfos[proposalId].token;
                receptions.givenAmounts[i] = proposalInfos[proposalId].balancePosition.ratio(
                    lp2s[i],
                    propSupply
                );
                receptions.baseAmount += proposalInfos[proposalId].balanceBase.ratio(
                    lp2s[i],
                    propSupply
                );

                receptions.receivedAmounts[i] = priceFeed.getNormPriceOut(
                    proposalInfos[proposalId].token,
                    parentTraderPoolInfo.baseToken,
                    receptions.givenAmounts[i]
                );
                receptions.baseAmount += receptions.receivedAmounts[i];
            }
        }
    }

    function getExchangeAmount(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        address positionToken,
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath,
        bool fromExact
    ) external view returns (uint256, address[] memory) {
        if (proposalId > TraderPoolRiskyProposal(address(this)).proposalsTotalNum()) {
            return (0, new address[](0));
        }

        address baseToken = parentTraderPoolInfo.baseToken;
        address to;

        if (from != baseToken && from != positionToken) {
            return (0, new address[](0));
        }

        if (from == baseToken) {
            to = positionToken;
        } else {
            to = baseToken;
        }

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();

        return
            fromExact
                ? priceFeed.getNormalizedExtendedPriceOut(from, to, amount, optionalPath)
                : priceFeed.getNormalizedExtendedPriceIn(from, to, amount, optionalPath);
    }
}
