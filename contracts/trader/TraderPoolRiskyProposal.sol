// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../interfaces/trader/IBasicTraderPool.sol";

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

    mapping(uint256 => ProposalInfo) public proposalInfos; // proposal id => info

    event ProposalInvest(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalDivest(uint256 index, address investor, uint256 amount);
    event ProposalExchange(
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

        proposalInfos[proposalId].proposalLimits = proposalLimits;
    }

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        override
        returns (ProposalInfo[] memory proposals)
    {
        return TraderPoolRiskyProposalView.getProposalInfos(proposalInfos, offset, limit);
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (ActiveInvestmentInfo[] memory investments) {
        return
            TraderPoolRiskyProposalView.getActiveInvestmentsInfo(
                _activeInvestments[user],
                proposalInfos,
                _lpBalances,
                user,
                offset,
                limit
            );
    }

    function getCreationTokens(
        address token,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        address[] calldata optionalPath
    ) external view override returns (uint256) {
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

        _checkPriceFeedAllowance(baseToken);
        _checkPriceFeedAllowance(token);

        proposalInfos[proposalId].token = token;
        proposalInfos[proposalId].tokenDecimals = ERC20(token).decimals();
        proposalInfos[proposalId].proposalLimits = proposalLimits;

        _transferAndMintLP(proposalId, trader, lpInvestment, baseInvestment);
        _activePortfolio(
            proposalId,
            baseInvestment,
            baseInvestment.percentage(instantTradePercentage),
            lpInvestment,
            optionalPath,
            minProposalOut
        );

        emit ProposalCreated(proposals, token, proposalLimits);
    }

    function _activePortfolio(
        uint256 proposalId,
        uint256 baseInvestment,
        uint256 baseToExchange,
        uint256 lpInvestment,
        address[] memory optionalPath,
        uint256 minProposalOut
    ) internal {
        ProposalInfo storage info = proposalInfos[proposalId];

        info.investedLP += lpInvestment;
        info.balanceBase += baseInvestment - baseToExchange;
        info.balancePosition += priceFeed.normalizedExchangeFromExact(
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
        returns (uint256 baseAmount, uint256 positionAmount)
    {
        return
            _parentTraderPoolInfo.getInvestTokens(
                proposalInfos[proposalId],
                proposalId,
                baseInvestment
            );
    }

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 minPositionOut
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];

        require(
            info.proposalLimits.timestampLimit == 0 ||
                block.timestamp <= info.proposalLimits.timestampLimit,
            "TPRP: proposal is closed"
        );
        require(
            info.proposalLimits.investLPLimit == 0 ||
                info.investedLP + lpInvestment <= info.proposalLimits.investLPLimit,
            "TPRP: proposal is overinvested"
        );

        uint256 tokenPriceConverted = priceFeed.getNormalizedPriceOut(
            info.token,
            _parentTraderPoolInfo.baseToken,
            10**18
        );

        require(
            info.proposalLimits.maxTokenPriceLimit == 0 ||
                tokenPriceConverted <= info.proposalLimits.maxTokenPriceLimit,
            "TPRP: token price too high"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = _getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = _getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPRP: investing more than trader");
        }

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        if (info.balancePosition + info.balanceBase > 0) {
            uint256 positionTokens = tokenPriceConverted.ratio(info.balancePosition, 10**18);
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
    }

    function _divestProposalInvestor(
        uint256 proposalId,
        address investor,
        uint256 lp2,
        uint256 minPositionOut
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        uint256 supply = totalSupply(proposalId);

        uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(lp2, supply);
        uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(lp2, supply);

        receivedBase =
            baseShare +
            priceFeed.normalizedExchangeFromExact(
                proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                positionShare,
                new address[](0),
                minPositionOut
            );
        lpToBurn = _updateFrom(investor, proposalId, lp2);

        proposalInfos[proposalId].balanceBase -= baseShare;
        proposalInfos[proposalId].balancePosition -= positionShare;

        _burn(investor, proposalId, lp2);
    }

    function _divestProposalTrader(
        uint256 proposalId,
        address trader,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        require(
            proposalInfos[proposalId].balancePosition == 0,
            "TPRP: divesting with open position"
        );

        receivedBase = proposalInfos[proposalId].balanceBase.ratio(lp2, totalSupply(proposalId));
        lpToBurn = _updateFrom(trader, proposalId, lp2);

        proposalInfos[proposalId].balanceBase -= receivedBase;

        _burn(trader, proposalId, lp2);
    }

    function getDivestAmounts(uint256[] calldata proposalIds, uint256[] calldata lp2s)
        external
        view
        override
        returns (Receptions memory receptions)
    {
        return _parentTraderPoolInfo.getDivestAmounts(proposalInfos, proposalIds, lp2s);
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

        totalLockedLP -= lpToBurn;
        investedBase -= receivedBase.min(investedBase);

        emit ProposalDivest(proposalId, user, lp2);

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

    function _getExchangeAmount(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath,
        bool fromExact
    ) internal view returns (uint256) {
        return
            _parentTraderPoolInfo.getExchangeAmount(
                proposalInfos[proposalId].token,
                proposalId,
                from,
                amount,
                optionalPath,
                fromExact
            );
    }

    function getExchangeFromExactAmount(
        uint256 proposalId,
        address from,
        uint256 amountIn,
        address[] calldata optionalPath
    ) external view override returns (uint256 minAmountOut) {
        return _getExchangeAmount(proposalId, from, amountIn, optionalPath, true);
    }

    function exchangeFromExact(
        uint256 proposalId,
        address from,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];
        address baseToken = _parentTraderPoolInfo.baseToken;
        address positionToken = info.token;

        require(from == baseToken || from == positionToken, "TPRP: invalid from token");

        if (from == baseToken) {
            require(amountIn <= info.balanceBase, "TPRP: wrong base amount");

            info.balancePosition += priceFeed.normalizedExchangeFromExact(
                baseToken,
                positionToken,
                amountIn,
                optionalPath,
                minAmountOut
            );
            info.balanceBase -= amountIn;
            emit ProposalExchange(proposalId, baseToken, positionToken, amountIn, minAmountOut);
        } else {
            require(amountIn <= info.balancePosition, "TPRP: wrong position amount");

            info.balanceBase += priceFeed.normalizedExchangeFromExact(
                positionToken,
                baseToken,
                amountIn,
                optionalPath,
                minAmountOut
            );
            info.balancePosition -= amountIn;
            emit ProposalExchange(proposalId, positionToken, baseToken, amountIn, minAmountOut);
        }
    }

    function getExchangeToExactAmount(
        uint256 proposalId,
        address from,
        uint256 amountOut,
        address[] calldata optionalPath
    ) external view override returns (uint256 maxAmountIn) {
        return _getExchangeAmount(proposalId, from, amountOut, optionalPath, true);
    }

    function exchangeToExact(
        uint256 proposalId,
        address from,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];
        address baseToken = _parentTraderPoolInfo.baseToken;
        address positionToken = info.token;

        require(from == baseToken || from == positionToken, "TPRP: invalid from token");

        if (from == baseToken) {
            require(maxAmountIn <= info.balanceBase, "TPRP: wrong base amount");

            info.balanceBase -= priceFeed.normalizedExchangeToExact(
                baseToken,
                positionToken,
                amountOut,
                optionalPath,
                maxAmountIn
            );
            info.balancePosition += amountOut;
            emit ProposalExchange(proposalId, baseToken, positionToken, amountOut, maxAmountIn);
        } else {
            require(maxAmountIn <= info.balancePosition, "TPRP: wrong position amount");

            info.balancePosition -= priceFeed.normalizedExchangeToExact(
                positionToken,
                baseToken,
                amountOut,
                optionalPath,
                maxAmountIn
            );
            info.balanceBase += amountOut;
            emit ProposalExchange(proposalId, positionToken, baseToken, amountOut, maxAmountIn);
        }
    }

    function _getInvestmentPercentage(
        uint256 proposalId,
        address user,
        uint256 toBeInvested
    ) internal view returns (uint256) {
        uint256 traderLPBalance = totalLPBalances[user] +
            IERC20(_parentTraderPoolInfo.parentPoolAddress).balanceOf(user);

        return
            (_lpBalances[user][proposalId] + toBeInvested).ratio(PERCENTAGE_100, traderLPBalance);
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return
            proposalInfos[proposalId].balanceBase +
            priceFeed.getNormalizedPriceOut(
                proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                proposalInfos[proposalId].balancePosition
            );
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(priceFeed)) == 0) {
            IERC20(token).safeApprove(address(priceFeed), MAX_UINT);
        }
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal override returns (uint256 lpTransfer) {
        lpTransfer = _lpBalances[user][proposalId].ratio(amount, balanceOf(user, proposalId));

        _lpBalances[user][proposalId] -= lpTransfer;
        totalLPBalances[user] -= lpTransfer;

        if (balanceOf(user, proposalId) == amount) {
            _activeInvestments[user].remove(proposalId);

            if (_activeInvestments[user].length() == 0) {
                IBasicTraderPool(_parentTraderPoolInfo.parentPoolAddress).checkRemoveInvestor(
                    user
                );
            }
        }
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal override {
        IBasicTraderPool(_parentTraderPoolInfo.parentPoolAddress).checkNewInvestor(user);

        _lpBalances[user][proposalId] += lpAmount;
        totalLPBalances[user] += lpAmount;
    }
}
