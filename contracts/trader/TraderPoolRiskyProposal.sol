// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../interfaces/trader/IBasicTraderPool.sol";

import "../libs/PriceFeed/PriceFeedLocal.sol";
import "../libs/TraderPoolProposal/TraderPoolRiskyProposalView.sol";

import "../core/Globals.sol";
import "./TraderPoolProposal.sol";

contract TraderPoolRiskyProposal is ITraderPoolRiskyProposal, TraderPoolProposal {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using Address for address;
    using TraderPoolRiskyProposalView for ParentTraderPoolInfo;
    using PriceFeedLocal for IPriceFeed;

    mapping(uint256 => ProposalInfo) internal _proposalInfos; // proposal id => info

    event ProposalInvested(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalDivested(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalExchanged(
        uint256 index,
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );
    event ProposalCreated(
        uint256 index,
        address token,
        ITraderPoolRiskyProposal.ProposalLimits proposalLimits
    );

    function __TraderPoolRiskyProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        initializer
    {
        __TraderPoolProposal_init(parentTraderPoolInfo);
    }

    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external
        override
        onlyTraderAdmin
    {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        _proposalInfos[proposalId].proposalLimits = proposalLimits;
    }

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        override
        returns (ProposalInfoExtended[] memory proposals)
    {
        return
            TraderPoolRiskyProposalView.getProposalInfos(
                _proposalInfos,
                _investors,
                offset,
                limit
            );
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (ActiveInvestmentInfo[] memory investments) {
        return
            TraderPoolRiskyProposalView.getActiveInvestmentsInfo(
                _activeInvestments[user],
                _proposalInfos,
                _lpBalances,
                user,
                offset,
                limit
            );
    }

    function getUserInvestmentsLimits(address user, uint256[] calldata proposalIds)
        external
        view
        override
        returns (uint256[] memory lps)
    {
        return _parentTraderPoolInfo.getUserInvestmentsLimits(_lpBalances, user, proposalIds);
    }

    function getCreationTokens(
        address token,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        address[] calldata optionalPath
    )
        external
        view
        override
        returns (
            uint256 positionTokens,
            uint256 positionTokenPrice,
            address[] memory path
        )
    {
        return
            _parentTraderPoolInfo.getCreationTokens(
                token,
                baseInvestment.percentage(instantTradePercentage),
                optionalPath
            );
    }

    function create(
        address token,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        uint256 minProposalOut,
        address[] calldata optionalPath
    ) external override onlyParentTraderPool returns (uint256 proposalId) {
        require(token.isContract(), "BTP: not a contract");
        require(token != _parentTraderPoolInfo.baseToken, "BTP: wrong proposal token");
        require(
            proposalLimits.timestampLimit == 0 || proposalLimits.timestampLimit >= block.timestamp,
            "TPRP: wrong timestamp"
        );
        require(
            proposalLimits.investLPLimit == 0 || proposalLimits.investLPLimit >= lpInvestment,
            "TPRP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPRP: zero investment");
        require(instantTradePercentage <= PERCENTAGE_100, "TPRP: percantage is bigger than 100");

        proposalId = ++proposalsTotalNum;

        address baseToken = _parentTraderPoolInfo.baseToken;
        address trader = _parentTraderPoolInfo.trader;

        priceFeed.checkAllowance(baseToken);
        priceFeed.checkAllowance(token);

        _proposalInfos[proposalId].token = token;
        _proposalInfos[proposalId].tokenDecimals = ERC20(token).decimals();
        _proposalInfos[proposalId].proposalLimits = proposalLimits;

        _transferAndMintLP(proposalId, trader, lpInvestment, baseInvestment);
        _activePortfolio(
            proposalId,
            baseInvestment,
            baseInvestment.percentage(instantTradePercentage),
            lpInvestment,
            optionalPath,
            minProposalOut
        );

        emit ProposalCreated(proposalId, token, proposalLimits);
        emit ProposalInvested(proposalId, trader, lpInvestment, baseInvestment);
    }

    function _activePortfolio(
        uint256 proposalId,
        uint256 baseInvestment,
        uint256 baseToExchange,
        uint256 lpInvestment,
        address[] memory optionalPath,
        uint256 minProposalOut
    ) internal {
        ProposalInfo storage info = _proposalInfos[proposalId];

        info.lpLocked += lpInvestment;
        info.balanceBase += baseInvestment - baseToExchange;
        info.balancePosition += priceFeed.normExchangeFromExact(
            _parentTraderPoolInfo.baseToken,
            info.token,
            baseToExchange,
            optionalPath,
            minProposalOut
        );
    }

    function getInvestTokens(uint256 proposalId, uint256 baseInvestment)
        external
        view
        override
        returns (
            uint256 baseAmount,
            uint256 positionAmount,
            uint256 lp2Amount
        )
    {
        return
            _parentTraderPoolInfo.getInvestTokens(
                _proposalInfos[proposalId],
                proposalId,
                baseInvestment
            );
    }

    function getInvestmentPercentage(
        uint256 proposalId,
        address user,
        uint256 toBeInvested
    ) public view override returns (uint256) {
        uint256 lpBalance = totalLPBalances[user] +
            IERC20(_parentTraderPoolInfo.parentPoolAddress).balanceOf(user);

        return (_lpBalances[user][proposalId] + toBeInvested).ratio(PERCENTAGE_100, lpBalance);
    }

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 minPositionOut
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = _proposalInfos[proposalId];

        require(
            info.proposalLimits.timestampLimit == 0 ||
                block.timestamp <= info.proposalLimits.timestampLimit,
            "TPRP: proposal is closed"
        );
        require(
            info.proposalLimits.investLPLimit == 0 ||
                info.lpLocked + lpInvestment <= info.proposalLimits.investLPLimit,
            "TPRP: proposal is overinvested"
        );
        require(
            info.proposalLimits.maxTokenPriceLimit == 0 ||
                priceFeed.getNormPriceIn(_parentTraderPoolInfo.baseToken, info.token, DECIMALS) <=
                info.proposalLimits.maxTokenPriceLimit,
            "TPRP: token price too high"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPRP: investing more than trader");
        }

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        if (info.balancePosition + info.balanceBase > 0) {
            uint256 positionTokens = priceFeed.getNormPriceOut(
                info.token,
                _parentTraderPoolInfo.baseToken,
                info.balancePosition
            );
            uint256 baseToExchange = baseInvestment.ratio(
                positionTokens,
                positionTokens + info.balanceBase
            );

            _activePortfolio(
                proposalId,
                baseInvestment,
                baseToExchange,
                lpInvestment,
                new address[](0),
                minPositionOut
            );
        }

        emit ProposalInvested(proposalId, user, lpInvestment, baseInvestment);
    }

    function _divestProposalInvestor(
        uint256 proposalId,
        address investor,
        uint256 lp2,
        uint256 minPositionOut
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        uint256 supply = totalSupply(proposalId);

        uint256 positionShare = _proposalInfos[proposalId].balancePosition.ratio(lp2, supply);
        uint256 baseShare = _proposalInfos[proposalId].balanceBase.ratio(lp2, supply);

        receivedBase =
            baseShare +
            priceFeed.normExchangeFromExact(
                _proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                positionShare,
                new address[](0),
                minPositionOut
            );
        lpToBurn = _updateFrom(investor, proposalId, lp2);

        _proposalInfos[proposalId].balanceBase -= baseShare;
        _proposalInfos[proposalId].balancePosition -= positionShare;

        _burn(investor, proposalId, lp2);
    }

    function _divestProposalTrader(
        uint256 proposalId,
        address trader,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        require(
            _proposalInfos[proposalId].balancePosition == 0,
            "TPRP: divesting with open position"
        );

        receivedBase = _proposalInfos[proposalId].balanceBase.ratio(lp2, totalSupply(proposalId));
        lpToBurn = _updateFrom(trader, proposalId, lp2);

        _proposalInfos[proposalId].balanceBase -= receivedBase;

        _burn(trader, proposalId, lp2);
    }

    function getDivestAmounts(uint256[] calldata proposalIds, uint256[] calldata lp2s)
        external
        view
        override
        returns (Receptions memory receptions)
    {
        return _parentTraderPoolInfo.getDivestAmounts(_proposalInfos, proposalIds, lp2s);
    }

    function divest(
        uint256 proposalId,
        address user,
        uint256 lp2,
        uint256 minPositionOut
    ) public override onlyParentTraderPool returns (uint256) {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");
        require(balanceOf(user, proposalId) >= lp2, "TPRP: divesting more than balance");

        uint256 receivedBase;
        uint256 lpToBurn;

        if (user == _parentTraderPoolInfo.trader) {
            (receivedBase, lpToBurn) = _divestProposalTrader(proposalId, user, lp2);
        } else {
            (receivedBase, lpToBurn) = _divestProposalInvestor(
                proposalId,
                user,
                lp2,
                minPositionOut
            );
        }

        _proposalInfos[proposalId].lpLocked -= lpToBurn;

        totalLockedLP -= lpToBurn;
        investedBase -= receivedBase.min(investedBase);

        emit ProposalDivested(proposalId, user, lp2, receivedBase);

        return receivedBase;
    }

    function divestAll(address user, uint256[] calldata minPositionsOut)
        external
        override
        onlyParentTraderPool
        returns (uint256 totalReceivedBase)
    {
        uint256 length = _activeInvestments[user].length();

        while (length > 0) {
            uint256 proposalId = _activeInvestments[user].at(--length);

            totalReceivedBase += divest(
                proposalId,
                user,
                balanceOf(user, proposalId),
                minPositionsOut[length]
            );
        }
    }

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount,
        uint256 amountBound,
        address[] calldata optionalPath,
        ExchangeType exType
    ) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = _proposalInfos[proposalId];

        address baseToken = _parentTraderPoolInfo.baseToken;
        address positionToken = info.token;
        address to;

        require(from == baseToken || from == positionToken, "TPRP: invalid from token");

        if (from == baseToken) {
            to = positionToken;
        } else {
            to = baseToken;
        }

        uint256 amountGot;

        if (exType == ITraderPoolRiskyProposal.ExchangeType.FROM_EXACT) {
            if (from == baseToken) {
                require(amount <= info.balanceBase, "TPRP: wrong base amount");
            } else {
                require(amount <= info.balancePosition, "TPRP: wrong position amount");
            }

            amountGot = priceFeed.normExchangeFromExact(
                from,
                to,
                amount,
                optionalPath,
                amountBound
            );
        } else {
            if (from == baseToken) {
                require(amountBound <= info.balanceBase, "TPRP: wrong base amount");
            } else {
                require(amountBound <= info.balancePosition, "TPRP: wrong position amount");
            }

            amountGot = priceFeed.normExchangeToExact(from, to, amount, optionalPath, amountBound);

            (amount, amountGot) = (amountGot, amount);
        }

        if (from == baseToken) {
            info.balanceBase -= amount;
            info.balancePosition += amountGot;
        } else {
            info.balanceBase += amountGot;
            info.balancePosition -= amount;
        }

        emit ProposalExchanged(proposalId, from, to, amount, amountGot);
    }

    function getExchangeAmount(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath,
        ExchangeType exType
    ) external view override returns (uint256, address[] memory) {
        return
            _parentTraderPoolInfo.getExchangeAmount(
                _proposalInfos[proposalId].token,
                proposalId,
                from,
                amount,
                optionalPath,
                exType
            );
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return
            _proposalInfos[proposalId].balanceBase +
            priceFeed.getNormPriceOut(
                _proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                _proposalInfos[proposalId].balancePosition
            );
    }
}
