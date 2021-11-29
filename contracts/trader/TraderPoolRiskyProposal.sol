// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

import "../libs/DecimalsConverter.sol";

import "../core/Globals.sol";
import "./TraderPoolProposal.sol";

contract TraderPoolRiskyProposal is ITraderPoolRiskyProposal, TraderPoolProposal {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;

    mapping(uint256 => ProposalInfo) public proposalInfos; // proposal id => info

    function __TraderPoolRiskyProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        override
        initializer
    {
        __TraderPoolProposal_init(parentTraderPoolInfo);
    }

    function changeProposalRestrictions(
        uint256 proposalId,
        uint256 timestampLimit,
        uint256 investLPLimit,
        uint256 maxTokenPriceLimit
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        proposalInfos[proposalId].timestampLimit = timestampLimit;
        proposalInfos[proposalId].investLPLimit = investLPLimit;
        proposalInfos[proposalId].maxTokenPriceLimit = maxTokenPriceLimit;
    }

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalInfo[] memory proposals)
    {
        uint256 to = (offset + limit).min(proposalsTotalNum).max(offset);

        proposals = new ProposalInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            proposals[i - offset] = proposalInfos[i];
        }
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments) {
        uint256 to = (offset + limit).min(_activeInvestments[user].length()).max(offset);

        investments = new ActiveInvestmentInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            uint256 proposalId = _activeInvestments[user].at(i);
            uint256 balance = balanceOf(user, proposalId);
            uint256 supply = totalSupply(proposalId);

            uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(balance, supply);
            uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(
                balance,
                supply
            );

            investments[i - offset] = ActiveInvestmentInfo(
                proposalId,
                _lpInvestments[user][proposalId],
                baseShare,
                positionShare
            );
        }
    }

    function _transferAndMintLP(
        uint256 proposalId,
        address to,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) internal {
        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            _parentTraderPoolInfo.parentPoolAddress,
            address(this),
            baseInvestment.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        uint256 totalSupply = totalSupply(proposalId);
        uint256 toMint = baseInvestment;

        if (totalSupply != 0) {
            toMint = toMint.ratio(_getBaseInProposal(proposalId), totalSupply);
        }

        totalLockedLP += lpInvestment;
        totalInvestedBase += baseInvestment;

        _activeInvestments[to].add(proposalId);

        proposalInfos[proposalId].investedLP += lpInvestment;

        _lpInvestments[to][proposalId] += lpInvestment;
        totalLPInvestments[to] += lpInvestment;

        _mint(to, proposalId, toMint, "");
    }

    function createProposal(
        address token,
        uint256 timestampLimit,
        uint256 investLPLimit,
        uint256 maxTokenPriceLimit,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage
    ) external override onlyParentTraderPool {
        require(timestampLimit == 0 || timestampLimit >= block.timestamp, "TPRP: wrong timestamp");
        require(
            investLPLimit == 0 || investLPLimit >= lpInvestment,
            "TPRP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPRP: zero investment");
        require(instantTradePercentage <= PERCENTAGE_100, "TPRP: percantage is bigger than 100");

        uint256 proposals = ++proposalsTotalNum;

        address baseToken = _parentTraderPoolInfo.baseToken;
        address trader = _parentTraderPoolInfo.trader;

        _transferAndMintLP(proposals, trader, lpInvestment, baseInvestment);

        _checkPriceFeedAllowance(baseToken);
        _checkPriceFeedAllowance(token);

        proposalInfos[proposals].token = token;
        proposalInfos[proposals].tokenDecimals = ERC20(token).decimals();
        proposalInfos[proposals].timestampLimit = timestampLimit;
        proposalInfos[proposals].investLPLimit = investLPLimit;
        proposalInfos[proposals].maxTokenPriceLimit = maxTokenPriceLimit;

        _activePortfolio(proposals, instantTradePercentage, PERCENTAGE_100, baseInvestment);
    }

    function _getInvestmentPercentage(
        uint256 proposalId,
        address user,
        uint256 toBeInvested
    ) internal view returns (uint256) {
        uint256 traderLPBalance = totalLPInvestments[user] +
            IERC20(_parentTraderPoolInfo.parentPoolAddress).balanceOf(user);

        return
            (_lpInvestments[user][proposalId] + toBeInvested).ratio(
                PERCENTAGE_100,
                traderLPBalance
            );
    }

    function _activePortfolio(
        uint256 proposalId,
        uint256 positionTokens,
        uint256 totalTokens,
        uint256 baseInvestment
    ) internal {
        ProposalInfo storage info = proposalInfos[proposalId];

        uint256 baseToExchange = baseInvestment.ratio(positionTokens, totalTokens);

        info.balanceBase += baseInvestment - baseToExchange;
        info.balancePosition += _priceFeed.normalizedExchangeTo(
            _parentTraderPoolInfo.baseToken,
            info.token,
            baseToExchange
        );
    }

    function investProposal(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];

        require(
            info.timestampLimit == 0 || block.timestamp <= info.timestampLimit,
            "TPRP: proposal is closed"
        );
        require(
            info.investLPLimit == 0 || info.investedLP + lpInvestment <= info.investLPLimit,
            "TPRP: proposal is overinvested"
        );

        uint256 tokenPriceConverted = _priceFeed.getNormalizedPriceIn(
            info.token,
            _parentTraderPoolInfo.baseToken,
            10**18
        );

        require(
            info.maxTokenPriceLimit == 0 || tokenPriceConverted <= info.maxTokenPriceLimit,
            "TPRP: token price too high"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = _getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = _getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPRP: investing more than trader");
        }

        uint256 positionTokens = tokenPriceConverted.ratio(info.balancePosition, 10**18);

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);
        _activePortfolio(
            proposalId,
            positionTokens,
            positionTokens + info.balanceBase,
            baseInvestment
        );
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

    function _divestProposalInvestor(
        uint256 proposalId,
        address investor,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        uint256 propSupply = totalSupply(proposalId);

        uint256 positionShare = proposalInfos[proposalId].balancePosition.ratio(lp2, propSupply);
        uint256 baseShare = proposalInfos[proposalId].balanceBase.ratio(lp2, propSupply);

        receivedBase =
            baseShare +
            _priceFeed.normalizedExchangeTo(
                proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                positionShare
            );
        lpToBurn = _updateFrom(investor, proposalId, lp2);

        proposalInfos[proposalId].balanceBase -= baseShare;
        proposalInfos[proposalId].balancePosition -= positionShare;

        _burn(investor, proposalId, lp2);
    }

    function divestProposal(
        uint256 proposalId,
        address user,
        uint256 lp2
    ) public override onlyParentTraderPool returns (uint256) {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");
        require(
            lp2 > 0 && balanceOf(user, proposalId) >= lp2,
            "TPRP: divesting more than balance"
        );

        uint256 receivedBase;
        uint256 lpToBurn;

        if (user == _parentTraderPoolInfo.trader) {
            (receivedBase, lpToBurn) = _divestProposalTrader(proposalId, user, lp2);
        } else {
            (receivedBase, lpToBurn) = _divestProposalInvestor(proposalId, user, lp2);
        }

        totalLockedLP -= lpToBurn;
        totalInvestedBase -= receivedBase;

        return receivedBase;
    }

    function divestAllProposals(address user)
        external
        override
        onlyParentTraderPool
        returns (uint256 totalReceivedBase)
    {
        uint256 length = _activeInvestments[user].length();

        while (length > 0) {
            uint256 proposalId = _activeInvestments[user].at(--length);

            totalReceivedBase += divestProposal(proposalId, user, balanceOf(user, proposalId));
        }
    }

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPRP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];
        address baseToken = _parentTraderPoolInfo.baseToken;

        require(from == baseToken || from == info.token, "TPRP: invalid from token");

        if (from == baseToken) {
            require(amount <= info.balanceBase, "TPRP: wrong base amount");

            info.balanceBase -= amount;
            info.balancePosition += _priceFeed.normalizedExchangeTo(from, info.token, amount);
        } else {
            require(amount <= info.balancePosition, "TPRP: wrong position amount");

            info.balanceBase += _priceFeed.normalizedExchangeTo(from, baseToken, amount);
            info.balancePosition -= amount;
        }
    }

    function _getBaseInProposal(uint256 proposalId) internal view returns (uint256) {
        return
            proposalInfos[proposalId].balanceBase +
            _priceFeed.getNormalizedPriceIn(
                proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                proposalInfos[proposalId].balancePosition
            );
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(_priceFeed)) == 0) {
            IERC20(token).safeApprove(address(_priceFeed), MAX_UINT);
        }
    }
}
