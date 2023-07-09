// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../math/MathHelper.sol";
import "../price-feed/PriceFeedLocal.sol";

import "../../trader/TraderPoolRiskyProposal.sol";

library TraderPoolRiskyProposalView {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathHelper for uint256;
    using Math for uint256;
    using Address for address;
    using PriceFeedLocal for IPriceFeed;

    function getProposalInfos(
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        mapping(uint256 => EnumerableSet.AddressSet) storage investors,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolRiskyProposal.ProposalInfoExtended[] memory proposals) {
        TraderPoolRiskyProposal traderPoolRiskyProposal = TraderPoolRiskyProposal(address(this));

        uint256 to = (offset + limit).min(traderPoolRiskyProposal.proposalsTotalNum()).max(offset);

        proposals = new ITraderPoolRiskyProposal.ProposalInfoExtended[](to - offset);

        IPriceFeed priceFeed = traderPoolRiskyProposal.priceFeed();
        address baseToken = traderPoolRiskyProposal.getBaseToken();

        for (uint256 i = offset; i < to; i++) {
            ITraderPoolRiskyProposal.ProposalInfoExtended memory proposalInfo = proposals[
                i - offset
            ];

            proposalInfo.proposalInfo = proposalInfos[i + 1];

            proposalInfo.totalProposalBase =
                proposalInfo.proposalInfo.balanceBase +
                priceFeed.getNormPriceOut(
                    proposalInfo.proposalInfo.token,
                    baseToken,
                    proposalInfo.proposalInfo.balancePosition
                );
            (proposalInfo.totalProposalUSD, ) = priceFeed.getNormalizedPriceOutUSD(
                baseToken,
                proposalInfo.totalProposalBase
            );
            proposalInfo.lp2Supply = traderPoolRiskyProposal.totalSupply(i + 1);
            proposalInfo.totalInvestors = investors[i + 1].length();
            proposalInfo.positionTokenPrice = priceFeed.getNormPriceIn(
                baseToken,
                proposalInfo.proposalInfo.token,
                DECIMALS
            );
        }
    }

    function getActiveInvestmentsInfo(
        EnumerableSet.UintSet storage activeInvestments,
        mapping(address => mapping(uint256 => uint256)) storage baseBalances,
        mapping(address => mapping(uint256 => uint256)) storage lpBalances,
        mapping(uint256 => ITraderPoolRiskyProposal.ProposalInfo) storage proposalInfos,
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPoolRiskyProposal.ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(activeInvestments.length()).max(offset);

        investments = new ITraderPoolRiskyProposal.ActiveInvestmentInfo[](to - offset);

        mapping(uint256 => uint256) storage baseBalance = baseBalances[user];

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = activeInvestments.at(i);
            uint256 balance = TraderPoolRiskyProposal(address(this)).balanceOf(user, proposalId);
            uint256 supply = TraderPoolRiskyProposal(address(this)).totalSupply(proposalId);

            investments[i - offset] = ITraderPoolRiskyProposal.ActiveInvestmentInfo(
                proposalId,
                balance,
                baseBalance[proposalId],
                lpBalances[user][proposalId],
                proposalInfos[proposalId].balanceBase.ratio(balance, supply),
                proposalInfos[proposalId].balancePosition.ratio(balance, supply)
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

        mapping(uint256 => uint256) storage lpUserBalance = lpBalances[user];

        for (uint256 i = 0; i < proposalIds.length; i++) {
            if (user != trader) {
                uint256 proposalId = proposalIds[i];

                uint256 maxPercentage = proposal.getInvestmentPercentage(proposalId, trader, 0);
                uint256 maxInvestment = lpBalance.percentage(maxPercentage);

                lps[i] = maxInvestment > lpUserBalance[proposalId]
                    ? maxInvestment - lpUserBalance[proposalId]
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
        returns (uint256 positionTokens, uint256 positionTokenPrice, address[] memory path)
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
    ) external view returns (uint256 baseAmount, uint256 positionAmount, uint256 lp2Amount) {
        TraderPoolRiskyProposal traderPoolRiskyProposal = TraderPoolRiskyProposal(address(this));

        if (_zeroOrGreater(proposalId, traderPoolRiskyProposal.proposalsTotalNum())) {
            return (0, 0, 0);
        }

        IPriceFeed priceFeed = traderPoolRiskyProposal.priceFeed();
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
                traderPoolRiskyProposal.totalSupply(proposalId),
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
        TraderPoolRiskyProposal traderPoolRiskyProposal = TraderPoolRiskyProposal(address(this));

        receptions.positions = new address[](proposalIds.length);
        receptions.givenAmounts = new uint256[](proposalIds.length);
        receptions.receivedAmounts = new uint256[](proposalIds.length);

        IPriceFeed priceFeed = traderPoolRiskyProposal.priceFeed();
        uint256 proposalsTotalNum = traderPoolRiskyProposal.proposalsTotalNum();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (_zeroOrGreater(proposalId, proposalsTotalNum)) {
                continue;
            }

            uint256 propSupply = traderPoolRiskyProposal.totalSupply(proposalId);

            if (propSupply > 0) {
                receptions.positions[i] = proposalInfos[proposalId].token;
                receptions.givenAmounts[i] = proposalInfos[proposalId].balancePosition.ratio(
                    lp2s[i],
                    propSupply
                );
                receptions.receivedAmounts[i] = priceFeed.getNormPriceOut(
                    proposalInfos[proposalId].token,
                    parentTraderPoolInfo.baseToken,
                    receptions.givenAmounts[i]
                );

                receptions.baseAmount +=
                    proposalInfos[proposalId].balanceBase.ratio(lp2s[i], propSupply) +
                    receptions.receivedAmounts[i];
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
        ITraderPoolRiskyProposal.ExchangeType exType
    ) external view returns (uint256, address[] memory) {
        TraderPoolRiskyProposal traderPoolRiskyProposal = TraderPoolRiskyProposal(address(this));
        if (_zeroOrGreater(proposalId, traderPoolRiskyProposal.proposalsTotalNum())) {
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

        IPriceFeed priceFeed = traderPoolRiskyProposal.priceFeed();

        return
            exType == ITraderPoolRiskyProposal.ExchangeType.FROM_EXACT
                ? priceFeed.getNormalizedExtendedPriceOut(from, to, amount, optionalPath)
                : priceFeed.getNormalizedExtendedPriceIn(from, to, amount, optionalPath);
    }

    function _zeroOrGreater(uint256 a, uint256 b) internal pure returns (bool) {
        return a == 0 || a > b;
    }
}
