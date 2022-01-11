// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../libs/MathHelper.sol";
import "../../libs/DecimalsConverter.sol";

import "../../trader/TraderPoolRiskyProposal.sol";

library TraderPoolRiskyProposalView {
    using EnumerableSet for EnumerableSet.UintSet;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using Address for address;

    function getProposalInfos(
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolRiskyProposal.ProposalInfo[] memory proposals) {
        uint256 to = (offset + limit)
            .min(TraderPoolRiskyProposal(address(this)).proposalsTotalNum())
            .max(offset);

        proposals = new ITraderPoolRiskyProposal.ProposalInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            proposals[i - offset] = proposalInfos[i];
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

    function getCreationTokens(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        address token,
        uint256 baseToExchange,
        address[] calldata optionalPath
    ) external view returns (uint256) {
        address baseToken = parentTraderPoolInfo.baseToken;

        if (!token.isContract() || token == baseToken) {
            return 0;
        }

        return
            ITraderPoolRiskyProposal(address(this)).priceFeed().getNormalizedExtendedPriceOut(
                baseToken,
                token,
                baseToExchange,
                optionalPath
            );
    }

    function getInvestTokens(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        ITraderPoolRiskyProposal.ProposalInfo storage info,
        uint256 proposalId,
        uint256 baseInvestment
    ) external view returns (uint256 baseAmount, uint256 positionAmount) {
        if (proposalId > TraderPoolRiskyProposal(address(this)).proposalsTotalNum()) {
            return (0, 0);
        }

        if (info.balancePosition + info.balanceBase > 0) {
            IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();

            uint256 tokensPrice = priceFeed.getNormalizedPriceOut(
                info.token,
                parentTraderPoolInfo.baseToken,
                info.balancePosition
            );
            uint256 baseToExchange = baseInvestment.ratio(
                tokensPrice,
                tokensPrice + info.balanceBase
            );

            baseAmount = baseInvestment - baseToExchange;
            positionAmount = priceFeed.getNormalizedPriceOut(
                parentTraderPoolInfo.baseToken,
                info.token,
                baseToExchange
            );
        } else {
            baseAmount = baseInvestment;
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

                receptions.receivedAmounts[i] = priceFeed.getNormalizedPriceOut(
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
    ) external view returns (uint256) {
        if (proposalId > TraderPoolRiskyProposal(address(this)).proposalsTotalNum()) {
            return 0;
        }

        address baseToken = parentTraderPoolInfo.baseToken;
        address to;

        if (from != baseToken && from != positionToken) {
            return 0;
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
