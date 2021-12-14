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
    mapping(address => mapping(uint256 => RewardInfo)) public rewardInfos;

    function __TraderPoolInvestProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        override
        initializer
    {
        __TraderPoolProposal_init(parentTraderPoolInfo);
    }

    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external
        override
        onlyParentTraderPool
    {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        proposalInfos[proposalId].proposalLimits = proposalLimits;
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return proposalInfos[proposalId].investedBase;
    }

    function createProposal(
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(
            proposalLimits.timestampLimit == 0 || proposalLimits.timestampLimit >= block.timestamp,
            "TPIP: wrong timestamp"
        );
        require(
            proposalLimits.investLPLimit == 0 || proposalLimits.investLPLimit >= lpInvestment,
            "TPIP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPIP: zero investment");

        uint256 proposals = ++proposalsTotalNum;

        proposalInfos[proposals].proposalLimits = proposalLimits;

        _transferAndMintLP(proposals, _parentTraderPoolInfo.trader, lpInvestment, baseInvestment);

        proposalInfos[proposals].investedLP = lpInvestment;
        proposalInfos[proposals].investedBase = baseInvestment;
        proposalInfos[proposals].newInvestedBase = baseInvestment;
    }

    function _updateRewards(uint256 proposalId, address user) internal {
        RewardInfo storage rewardInfo = rewardInfos[user][proposalId];
        uint256 cumulativeSum = proposalInfos[proposalId].cumulativeSum;

        rewardInfo.rewardStored +=
            ((cumulativeSum - rewardInfo.cumulativeSumStored) * balanceOf(user, proposalId)) /
            PRECISION;
        rewardInfo.cumulativeSumStored = cumulativeSum;
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
            info.proposalLimits.timestampLimit == 0 ||
                block.timestamp <= info.proposalLimits.timestampLimit,
            "TPIP: proposal is closed"
        );
        require(
            info.proposalLimits.investLPLimit == 0 ||
                info.investedLP + lpInvestment <= info.proposalLimits.investLPLimit,
            "TPIP: proposal is overinvested"
        );

        _updateRewards(proposalId, user);
        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        info.investedLP += lpInvestment;
        info.investedBase += baseInvestment;
        info.newInvestedBase += baseInvestment;
    }

    function _claimProposal(uint256 proposalId, address user) internal returns (uint256 claimed) {
        _updateFromHelper(user, proposalId, claimed);

        claimed = rewardInfos[user][proposalId].rewardStored;

        require(claimed > 0, "TPIP: nothing to claim");

        delete rewardInfos[user][proposalId].rewardStored;

        totalLockedLP -= claimed.min(totalLockedLP);
        investedBase -= claimed.min(investedBase);
    }

    function _payout(uint256 amount) internal {
        IERC20(_parentTraderPoolInfo.baseToken).safeTransfer(
            _msgSender(),
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );
    }

    function _divestProposal(uint256 proposalId, address user) internal returns (uint256) {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        return _claimProposal(proposalId, user);
    }

    function _divestAllProposals(address user) internal returns (uint256 totalReceivedBase) {
        uint256 length = _activeInvestments[user].length();

        while (length > 0) {
            uint256 proposalId = _activeInvestments[user].at(--length);
            totalReceivedBase += _claimProposal(proposalId, user);
        }
    }

    function divestProposal(uint256 proposalId, address user)
        external
        override
        onlyParentTraderPool
        returns (uint256)
    {
        return _divestProposal(proposalId, user);
    }

    function divestAllProposals(address user)
        external
        override
        onlyParentTraderPool
        returns (uint256)
    {
        return _divestAllProposals(user);
    }

    function claimProposal(uint256 proposalId) external override {
        _payout(_divestProposal(proposalId, _msgSender()));
    }

    function claimAllProposals() external override {
        _payout(_divestAllProposals(_msgSender()));
    }

    function withdraw(uint256 proposalId, uint256 amount) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");
        require(
            amount <= proposalInfos[proposalId].newInvestedBase,
            "TPIP: withdrawing more than balance"
        );

        proposalInfos[proposalId].newInvestedBase -= amount;

        IERC20(_parentTraderPoolInfo.baseToken).safeTransfer(
            _parentTraderPoolInfo.trader,
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );
    }

    function supply(uint256 proposalId, uint256 amount) external override {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            _msgSender(),
            address(this),
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        _updateCumulativeSum(proposalId, amount);
    }

    function convertToDividends(uint256 proposalId) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        _updateCumulativeSum(proposalId, proposalInfos[proposalId].newInvestedBase);
        delete proposalInfos[proposalId].newInvestedBase;
    }

    function _updateCumulativeSum(uint256 proposalId, uint256 amount) internal {
        proposalInfos[proposalId].cumulativeSum += (amount * PRECISION) / totalSupply(proposalId);
    }

    function _updateFromHelper(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal returns (uint256 lpTransfer) {
        _updateRewards(proposalId, user);

        lpTransfer = _lpBalances[user][proposalId].ratio(amount, balanceOf(user, proposalId));

        _lpBalances[user][proposalId] -= lpTransfer;
        totalLPBalances[user] -= lpTransfer;
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal override returns (uint256 lpTransfer) {
        if (balanceOf(user, proposalId) - amount == 0) {
            _activeInvestments[user].remove(proposalId);
        }

        return _updateFromHelper(user, proposalId, amount);
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal override {
        _updateRewards(proposalId, user);

        _lpBalances[user][proposalId] += lpAmount;
        totalLPBalances[user] += lpAmount;
    }
}
