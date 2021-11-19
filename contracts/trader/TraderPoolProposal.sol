// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/trader/ITraderPoolProposal.sol";
import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";

import "../libs/DecimalsConverter.sol";
import "../libs/MathHelper.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

contract TraderPoolProposal is ITraderPoolProposal, ERC1155SupplyUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;

    IPriceFeed internal _priceFeed;

    ParentTraderPoolInfo internal _parentTraderPoolInfo;

    uint256 internal _proposalsTotalNum;

    uint256 public override totalLockedLP;
    uint256 public override totalInvestedBase;

    mapping(uint256 => ProposalInfo) internal _proposalInfos; // proposal id => info

    mapping(address => mapping(uint256 => uint256)) internal _lpInvestments; // user => proposal id => LP invested
    mapping(address => uint256) public override totalLPInvestments; // user => LP invested

    modifier onlyParentTraderPool() {
        require(msg.sender == _parentTraderPoolInfo.parentPoolAddress, "TPP: not a ParentPool");
        _;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external
        override
        initializer
    {
        __ERC1155_init("");

        _parentTraderPoolInfo = parentTraderPoolInfo;

        IERC20(parentTraderPoolInfo.baseToken).safeApprove(
            parentTraderPoolInfo.parentPoolAddress,
            MAX_UINT
        );
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        _priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
    }

    function _transferAndMintLP(
        uint256 proposalNum,
        address to,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) internal {
        address parentPool = _parentTraderPoolInfo.parentPoolAddress;
        uint256 baseInvesmentConverted = baseInvestment.convertFrom18(
            _parentTraderPoolInfo.baseTokenDecimals
        );

        IERC20(parentPool).safeTransferFrom(to, address(this), lpInvestment);
        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            parentPool,
            address(this),
            baseInvesmentConverted
        );

        uint256 totalSupply = totalSupply(proposalNum);
        uint256 toMint;

        if (totalSupply == 0) {
            toMint = baseInvestment;
        } else {
            toMint = baseInvestment.ratio(_getBaseInProposal(proposalNum), totalSupply);
        }

        totalLockedLP += lpInvestment;
        totalInvestedBase += baseInvestment;

        _proposalInfos[proposalNum].investedLP += lpInvestment;

        _lpInvestments[to][proposalNum] += lpInvestment;
        totalLPInvestments[to] += lpInvestment;

        _mint(to, proposalNum, toMint, "");
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
        require(timestampLimit == 0 || timestampLimit >= block.timestamp, "TPP: wrong timestamp");
        require(
            investLPLimit == 0 || investLPLimit >= lpInvestment,
            "TPP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPP: zero investment");
        require(instantTradePercentage <= PERCENTAGE_100, "TPP: percantage is bigger than 100");

        uint256 proposalsTotalNum = ++_proposalsTotalNum;

        address baseToken = _parentTraderPoolInfo.baseToken;
        address trader = _parentTraderPoolInfo.trader;

        _transferAndMintLP(proposalsTotalNum, trader, lpInvestment, baseInvestment);

        _checkPriceFeedAllowance(baseToken);
        _checkPriceFeedAllowance(token);

        _proposalInfos[proposalsTotalNum].token = token;
        _proposalInfos[proposalsTotalNum].tokenDecimals = ERC20(token).decimals();
        _proposalInfos[proposalsTotalNum].timestampLimit = timestampLimit;
        _proposalInfos[proposalsTotalNum].investLPLimit = investLPLimit;
        _proposalInfos[proposalsTotalNum].maxTokenPriceLimit = maxTokenPriceLimit;
        _proposalInfos[proposalsTotalNum].balanceBase = baseInvestment;

        if (instantTradePercentage > 0) {
            _proposalInfos[proposalsTotalNum].balancePosition = _priceFeed.normalizedExchangeTo(
                baseToken,
                token,
                baseInvestment.percentage(instantTradePercentage)
            );

            _proposalInfos[proposalsTotalNum].balanceBase = baseInvestment.percentage(
                PERCENTAGE_100 - instantTradePercentage
            );
        }
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

    function investProposal(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(proposalId <= _proposalsTotalNum, "TPP: proposal doesn't exist");

        ProposalInfo storage info = _proposalInfos[proposalId];

        require(
            info.timestampLimit == 0 || block.timestamp <= info.timestampLimit,
            "TPP: proposal is closed"
        );
        require(
            info.investLPLimit == 0 || info.investedLP + lpInvestment <= info.investLPLimit,
            "TPP: proposal is overinvested"
        );

        uint256 tokensPriceConverted = _priceFeed.getNormalizedPriceIn(
            info.token,
            _parentTraderPoolInfo.baseToken,
            info.balancePosition
        );

        require(
            info.maxTokenPriceLimit == 0 ||
                tokensPriceConverted / info.balancePosition <= info.maxTokenPriceLimit,
            "TPP: token price too high"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = _getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = _getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPP: investing more than trader");
        }

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        uint256 baseToExchange = baseInvestment.ratio(
            tokensPriceConverted,
            tokensPriceConverted + info.balanceBase
        );

        info.balanceBase += baseInvestment - baseToExchange;
        info.balancePosition += _priceFeed.normalizedExchangeTo(
            _parentTraderPoolInfo.baseToken,
            info.token,
            baseToExchange
        );
    }

    function _divestProposalTrader(
        uint256 proposalId,
        address trader,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        require(
            _proposalInfos[proposalId].balancePosition == 0,
            "TPP: divesting with open position"
        );

        receivedBase = _proposalInfos[proposalId].balanceBase.ratio(lp2, totalSupply(proposalId));
        lpToBurn = _updateInfo(trader, proposalId, lp2);

        _proposalInfos[proposalId].balanceBase -= receivedBase;
    }

    function _divestProposalInvestor(
        uint256 proposalId,
        address investor,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        uint256 propSupply = totalSupply(proposalId);

        uint256 positionShare = _proposalInfos[proposalId].balancePosition.ratio(lp2, propSupply);
        uint256 baseShare = _proposalInfos[proposalId].balanceBase.ratio(lp2, propSupply);

        receivedBase =
            baseShare +
            _priceFeed.normalizedExchangeTo(
                _proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                positionShare
            );

        lpToBurn = _updateInfo(investor, proposalId, lp2);

        _proposalInfos[proposalId].balanceBase -= baseShare;
        _proposalInfos[proposalId].balancePosition -= positionShare;
    }

    function divestProposal(
        uint256 proposalId,
        address user,
        uint256 lp2
    ) external override onlyParentTraderPool returns (uint256) {
        require(proposalId <= _proposalsTotalNum, "TPP: proposal doesn't exist");
        require(lp2 > 0 && balanceOf(user, proposalId) >= lp2, "TPP: divesting more than balance");

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

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount
    ) external override onlyParentTraderPool {
        require(proposalId <= _proposalsTotalNum, "TPP: proposal doesn't exist");

        ProposalInfo storage info = _proposalInfos[proposalId];
        address baseToken = _parentTraderPoolInfo.baseToken;

        require(from == baseToken || from == info.token, "TPP: invalid from token");

        if (from == baseToken) {
            require(amount <= info.balanceBase, "TPP: wrong base amount");

            info.balanceBase -= amount;
            info.balancePosition += _priceFeed.normalizedExchangeTo(from, info.token, amount);
        } else {
            require(amount <= info.balancePosition, "TPP: wrong position amount");

            info.balanceBase += _priceFeed.normalizedExchangeTo(from, baseToken, amount);
            info.balancePosition -= amount;
        }
    }

    function _getBaseInProposal(uint256 proposalId) internal view returns (uint256) {
        return
            _proposalInfos[proposalId].balanceBase +
            _priceFeed.getNormalizedPriceIn(
                _proposalInfos[proposalId].token,
                _parentTraderPoolInfo.baseToken,
                _proposalInfos[proposalId].balancePosition
            );
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(_priceFeed)) == 0) {
            IERC20(token).safeApprove(address(_priceFeed), MAX_UINT);
        }
    }

    function _updateInfo(
        address user,
        uint256 proposalId,
        uint256 lp2
    ) internal returns (uint256 lpToBurn) {
        lpToBurn = _updateFrom(user, proposalId, lp2);
        _burn(user, proposalId, lp2);
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal returns (uint256 lpTransfer) {
        lpTransfer = _lpInvestments[user][proposalId].ratio(amount, balanceOf(user, proposalId));

        _lpInvestments[user][proposalId] -= lpTransfer;
        totalLPInvestments[user] -= lpTransfer;
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal {
        _lpInvestments[user][proposalId] += lpAmount;
        totalLPInvestments[user] += lpAmount;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "TPP: 0 transfer");

            if (from != address(0) && to != address(0)) {
                require(balanceOf(to, ids[i]) > 0, "TPP: prohibited transfer");

                uint256 lpTransfer = _updateFrom(from, ids[i], amounts[i]);
                _updateTo(to, ids[i], lpTransfer);
            }
        }
    }
}
