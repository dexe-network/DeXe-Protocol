// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

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

    function __TraderPoolRiskyProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        override
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
        returns (ProposalInfo[] memory proposals)
    {
        return TraderPoolRiskyProposalView.getProposalInfos(proposalInfos, offset, limit);
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (TraderPoolRiskyProposalView.ActiveInvestmentInfo[] memory investments)
    {
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

    function createProposal(
        address token,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 baseToExchange,
        address[] calldata optionalPath,
        uint256 minPositionOut
    ) external override onlyParentTraderPool {
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
        require(baseToExchange <= baseInvestment, "TPRP: percantage is bigger than 100");

        uint256 proposals = ++proposalsTotalNum;

        address baseToken = _parentTraderPoolInfo.baseToken;
        address trader = _parentTraderPoolInfo.trader;

        _checkPriceFeedAllowance(baseToken);
        _checkPriceFeedAllowance(token);

        proposalInfos[proposals].token = token;
        proposalInfos[proposals].tokenDecimals = ERC20(token).decimals();
        proposalInfos[proposals].proposalLimits = proposalLimits;

        _transferAndMintLP(proposals, trader, lpInvestment, baseInvestment);
        _activePortfolio(
            proposals,
            baseToExchange,
            baseInvestment,
            lpInvestment,
            optionalPath,
            minPositionOut
        );
    }

    function getCreationTokens(
        address token,
        uint256 baseToExchange,
        address[] calldata optionalPath
    ) external view returns (uint256) {
        return _parentTraderPoolInfo.getCreationTokens(token, baseToExchange, optionalPath);
    }

    function _activePortfolio(
        uint256 proposalId,
        uint256 baseInvestment,
        uint256 baseToExchange,
        uint256 lpInvestment,
        address[] memory optionalPath,
        uint256 minPositionOut
    ) internal {
        ProposalInfo storage info = proposalInfos[proposalId];

        info.investedLP += lpInvestment;
        info.balanceBase += baseInvestment - baseToExchange;
        info.balancePosition += priceFeed.normalizedExchangeTo(
            _parentTraderPoolInfo.baseToken,
            info.token,
            baseToExchange,
            optionalPath,
            minPositionOut
        );
    }

    function getInvestTokens(uint256 proposalId, uint256 baseInvestment)
        external
        view
        returns (uint256 baseAmount, uint256 positionAmount)
    {
        return
            _parentTraderPoolInfo.getInvestTokens(
                proposalInfos[proposalId],
                proposalId,
                baseInvestment
            );
    }

    function investProposal(
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

        uint256 tokenPriceConverted = priceFeed.getNormalizedPriceIn(
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

        uint256 positionTokens = tokenPriceConverted.ratio(info.balancePosition, 10**18);
        uint256 baseToExchange = baseInvestment.ratio(
            positionTokens,
            positionTokens + info.balanceBase
        );

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);
        _activePortfolio(
            proposalId,
            baseToExchange,
            baseInvestment,
            lpInvestment,
            new address[](0),
            minPositionOut
        );
    }

    function _divestProposalInvestor(
        uint256 proposalId,
        address investor,
        uint256 lp2,
        uint256 minPositionOut
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        uint256 propSupply = totalSupply(proposalId);

        uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(lp2, propSupply);
        uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(lp2, propSupply);

        receivedBase =
            baseShare +
            priceFeed.normalizedExchangeTo(
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
        returns (TraderPoolRiskyProposalView.Receptions[] memory receptions)
    {
        return _parentTraderPoolInfo.getDivestAmounts(proposalInfos, proposalIds, lp2s);
    }

    function divestProposal(
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

        return receivedBase;
    }

    function divestAllProposals(address user, uint256[] calldata minPositionsOut)
        external
        override
        onlyParentTraderPool
        returns (uint256 totalReceivedBase)
    {
        uint256 length = _activeInvestments[user].length();

        while (length > 0) {
            uint256 proposalId = _activeInvestments[user].at(--length);

            totalReceivedBase += divestProposal(
                proposalId,
                user,
                balanceOf(user, proposalId),
                minPositionsOut[length]
            );
        }
    }

    function getExchangeAmount(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath
    ) external view returns (uint256 minAmountOut) {
        return
            _parentTraderPoolInfo.getExchangeAmount(
                proposalInfos[proposalId].token,
                proposalId,
                from,
                amount,
                optionalPath
            );
    }

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];
        address baseToken = _parentTraderPoolInfo.baseToken;

        require(from == baseToken || from == info.token, "TPRP: invalid from token");

        if (from == baseToken) {
            require(amount <= info.balanceBase, "TPRP: wrong base amount");

            info.balanceBase -= amount;
            info.balancePosition += priceFeed.normalizedExchangeTo(
                from,
                info.token,
                amount,
                optionalPath,
                minAmountOut
            );
        } else {
            require(amount <= info.balancePosition, "TPRP: wrong position amount");

            info.balanceBase += priceFeed.normalizedExchangeTo(
                from,
                baseToken,
                amount,
                optionalPath,
                minAmountOut
            );
            info.balancePosition -= amount;
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
            priceFeed.getNormalizedPriceIn(
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

        if (balanceOf(user, proposalId) - amount == 0) {
            _activeInvestments[user].remove(proposalId);
        }
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal override {
        _lpBalances[user][proposalId] += lpAmount;
        totalLPBalances[user] += lpAmount;
    }
}
