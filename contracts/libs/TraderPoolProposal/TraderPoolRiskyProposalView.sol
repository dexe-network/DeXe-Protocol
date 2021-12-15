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

    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lpInvested;
        uint256 baseShare;
        uint256 positionShare;
    }

    struct Receptions {
        uint256 totalBaseAmount;
        uint256 baseFromPosition; // should be used as minAmountOut
        uint256 positionAmount;
    }

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
    ) external view returns (ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(activeInvestments.length()).max(offset);

        investments = new ActiveInvestmentInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = activeInvestments.at(i);
            uint256 balance = TraderPoolRiskyProposal(address(this)).balanceOf(user, proposalId);
            uint256 supply = TraderPoolRiskyProposal(address(this)).totalSupply(proposalId);

            uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(balance, supply);
            uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(
                balance,
                supply
            );

            investments[i - offset] = ActiveInvestmentInfo(
                proposalId,
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
            ITraderPoolRiskyProposal(address(this)).priceFeed().getExtendedPriceIn(
                baseToken,
                token,
                baseToExchange.convertFrom18(parentTraderPoolInfo.baseTokenDecimals),
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

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();

        uint256 tokensPriceConverted = priceFeed.getNormalizedPriceIn(
            info.token,
            parentTraderPoolInfo.baseToken,
            info.balancePosition
        );
        uint256 baseToExchange = baseInvestment.ratio(
            tokensPriceConverted,
            tokensPriceConverted + info.balanceBase
        );

        baseAmount = baseInvestment - baseToExchange;
        positionAmount = priceFeed.getPriceIn(
            parentTraderPoolInfo.baseToken,
            info.token,
            baseToExchange.convertFrom18(parentTraderPoolInfo.baseTokenDecimals)
        );
    }

    function getDivestAmounts(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        uint256[] calldata proposalIds,
        uint256[] calldata lp2s
    ) external view returns (Receptions[] memory receptions) {
        receptions = new Receptions[](proposalIds.length);

        IPriceFeed priceFeed = ITraderPoolRiskyProposal(address(this)).priceFeed();
        uint256 proposalsTotalNum = TraderPoolRiskyProposal(address(this)).proposalsTotalNum();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (proposalId > proposalsTotalNum) {
                continue;
            }

            uint256 propSupply = TraderPoolRiskyProposal(address(this)).totalSupply(proposalId);

            receptions[i].positionAmount = proposalInfos[proposalId]
                .balancePosition
                .ratio(lp2s[i], propSupply)
                .convertFrom18(proposalInfos[proposalId].tokenDecimals);
            receptions[i].totalBaseAmount = proposalInfos[proposalId]
                .balanceBase
                .ratio(lp2s[i], propSupply)
                .convertFrom18(parentTraderPoolInfo.baseTokenDecimals);

            receptions[i].baseFromPosition = priceFeed.getPriceIn(
                proposalInfos[proposalId].token,
                parentTraderPoolInfo.baseToken,
                receptions[i].positionAmount
            );
            receptions[i].totalBaseAmount += receptions[i].baseFromPosition;
        }
    }

    function getExchangeAmount(
        ITraderPoolRiskyProposal.ParentTraderPoolInfo storage parentTraderPoolInfo,
        address positionToken,
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath
    ) external view returns (uint256 minAmountOut) {
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

        return
            ITraderPoolRiskyProposal(address(this)).priceFeed().getExtendedPriceIn(
                from,
                to,
                amount.convertFrom18(parentTraderPoolInfo.baseTokenDecimals),
                optionalPath
            );
    }
}
