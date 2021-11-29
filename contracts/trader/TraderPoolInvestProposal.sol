// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/trader/ITraderPoolInvestProposal.sol";

import "../libs/DecimalsConverter.sol";

import "../core/Globals.sol";
import "./TraderPoolProposal.sol";

contract TraderPoolInvestProposal is ITraderPoolInvestProposal, TraderPoolProposal {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;

    mapping(uint256 => ProposalInfo) public proposalInfos; // proposal id => info

    function __TraderPoolInvestProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        override
        initializer
    {
        __TraderPoolProposal_init(parentTraderPoolInfo);
    }

    function changeProposalRestrictions(
        uint256 proposalId,
        uint256 timestampLimit,
        uint256 investLPLimit
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        proposalInfos[proposalId].timestampLimit = timestampLimit;
        proposalInfos[proposalId].investLPLimit = investLPLimit;
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
            uint256 totalBase = proposalInfos[proposalId].balanceBase +
                proposalInfos[proposalId].debt;

            toMint = toMint.ratio(totalBase, totalSupply);
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
        uint256 timestampLimit,
        uint256 investLPLimit,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(timestampLimit == 0 || timestampLimit >= block.timestamp, "TPIP: wrong timestamp");
        require(
            investLPLimit == 0 || investLPLimit >= lpInvestment,
            "TPIP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPIP: zero investment");

        uint256 proposals = ++proposalsTotalNum;

        _transferAndMintLP(proposals, _parentTraderPoolInfo.trader, lpInvestment, baseInvestment);

        proposalInfos[proposals].timestampLimit = timestampLimit;
        proposalInfos[proposals].investLPLimit = investLPLimit;
        proposalInfos[proposals].balanceBase = baseInvestment;
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
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        ProposalInfo storage info = proposalInfos[proposalId];

        require(
            info.timestampLimit == 0 || block.timestamp <= info.timestampLimit,
            "TPIP: proposal is closed"
        );
        require(
            info.investLPLimit == 0 || info.investedLP + lpInvestment <= info.investLPLimit,
            "TPIP: proposal is overinvested"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = _getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = _getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPIP: investing more than trader");
        }

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        proposalInfos[proposalId].balanceBase += baseInvestment;
    }

    function _divestProposal(
        uint256 proposalId,
        address investor,
        uint256 lp2
    ) internal returns (uint256 receivedBase, uint256 lpToBurn) {
        receivedBase = proposalInfos[proposalId].balanceBase.ratio(lp2, totalSupply(proposalId));
        lpToBurn = _updateFrom(investor, proposalId, lp2);

        proposalInfos[proposalId].balanceBase -= receivedBase;

        _burn(investor, proposalId, lp2);
    }

    function divestProposal(
        uint256 proposalId,
        address user,
        uint256 lp2
    ) public override onlyParentTraderPool returns (uint256) {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");
        require(
            lp2 > 0 && balanceOf(user, proposalId) >= lp2,
            "TPIP: divesting more than balance"
        );
        require(
            user != _parentTraderPoolInfo.trader || proposalInfos[proposalId].debt == 0,
            "TPIP: divesting with open position"
        );

        (uint256 receivedBase, uint256 lpToBurn) = _divestProposal(proposalId, user, lp2);

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

    function withdraw(uint256 proposalId, uint256 amount) external override onlyParentTraderPool {
        ProposalInfo storage info = proposalInfos[proposalId];

        require(amount <= info.balanceBase, "TPIP: withdrawing more than balance");

        info.balanceBase -= amount;
        info.debt += amount;

        IERC20(_parentTraderPoolInfo.baseToken).safeTransfer(
            _parentTraderPoolInfo.trader,
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );
    }

    function supply(
        uint256 proposalId,
        address user,
        uint256 amount
    ) external override onlyParentTraderPool {
        ProposalInfo storage info = proposalInfos[proposalId];

        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            user,
            address(this),
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        info.balanceBase += amount;
        info.debt -= info.debt.min(amount);
    }
}
