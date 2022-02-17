// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/trader/ITraderPoolInvestProposal.sol";
import "../interfaces/trader/IInvestTraderPool.sol";

import "../libs/TraderPoolProposal/TraderPoolInvestProposalView.sol";
import "../libs/DecimalsConverter.sol";

import "../core/Globals.sol";
import "./TraderPoolProposal.sol";

contract TraderPoolInvestProposal is ITraderPoolInvestProposal, TraderPoolProposal {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using TraderPoolInvestProposalView for ParentTraderPoolInfo;

    mapping(uint256 => ProposalInfo) public proposalInfos; // proposal id => info
    mapping(address => mapping(uint256 => RewardInfo)) public rewardInfos;

    event ProposalInvested(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalDivested(uint256 index, address investor, uint256 amount);
    event ProposalCreated(uint256 index, ITraderPoolInvestProposal.ProposalLimits proposalLimits);
    event ProposalWithdrawn(uint256 index, uint256 amount, address investor);
    event ProposalSupplied(uint256 index, uint256 amount, address investor);

    function __TraderPoolInvestProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
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
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        proposalInfos[proposalId].proposalLimits = proposalLimits;
    }

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        override
        returns (ProposalInfo[] memory proposals)
    {
        return TraderPoolInvestProposalView.getProposalInfos(proposalInfos, offset, limit);
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (ActiveInvestmentInfo[] memory investments) {
        return
            TraderPoolInvestProposalView.getActiveInvestmentsInfo(
                _activeInvestments[user],
                proposalInfos,
                _lpBalances,
                rewardInfos,
                user,
                offset,
                limit
            );
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return proposalInfos[proposalId].investedBase;
    }

    function create(
        string calldata descriptionURL,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool returns (uint256 proposalId) {
        require(
            proposalLimits.timestampLimit == 0 || proposalLimits.timestampLimit >= block.timestamp,
            "TPIP: wrong timestamp"
        );
        require(
            proposalLimits.investLPLimit == 0 || proposalLimits.investLPLimit >= lpInvestment,
            "TPIP: wrong investment limit"
        );
        require(lpInvestment > 0 && baseInvestment > 0, "TPIP: zero investment");

        proposalId = ++proposalsTotalNum;

        proposalInfos[proposalId].proposalLimits = proposalLimits;

        _transferAndMintLP(proposalId, _parentTraderPoolInfo.trader, lpInvestment, baseInvestment);

        proposalInfos[proposalId].descriptionURL = descriptionURL;
        proposalInfos[proposalId].lpLocked = lpInvestment;
        proposalInfos[proposalId].investedBase = baseInvestment;
        proposalInfos[proposalId].newInvestedBase = baseInvestment;

        emit ProposalCreated(proposalId, proposalLimits);
        emit ProposalInvested(proposalId, msg.sender, lpInvestment, baseInvestment);
    }

    function _updateRewards(uint256 proposalId, address user) internal {
        RewardInfo storage rewardInfo = rewardInfos[user][proposalId];
        uint256 cumulativeSum = proposalInfos[proposalId].cumulativeSum;

        rewardInfo.rewardStored +=
            ((cumulativeSum - rewardInfo.cumulativeSumStored) * balanceOf(user, proposalId)) /
            PRECISION;
        rewardInfo.cumulativeSumStored = cumulativeSum;
    }

    function invest(
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
                info.lpLocked + lpInvestment <= info.proposalLimits.investLPLimit,
            "TPIP: proposal is overinvested"
        );

        _updateRewards(proposalId, user);
        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        info.lpLocked += lpInvestment;
        info.investedBase += baseInvestment;
        info.newInvestedBase += baseInvestment;

        emit ProposalInvested(proposalId, user, lpInvestment, baseInvestment);
    }

    function getRewards(uint256[] calldata proposalIds, address user)
        external
        view
        override
        returns (Receptions memory receptions)
    {
        return
            TraderPoolInvestProposalView.getRewards(proposalInfos, rewardInfos, proposalIds, user);
    }

    function _claimProposal(uint256 proposalId, address user) internal returns (uint256 claimed) {
        _updateRewards(proposalId, user);

        claimed = rewardInfos[user][proposalId].rewardStored;

        require(claimed > 0, "TPIP: nothing to claim");

        _updateFromData(user, proposalId, claimed);

        delete rewardInfos[user][proposalId].rewardStored;

        proposalInfos[proposalId].lpLocked -= claimed.min(proposalInfos[proposalId].lpLocked);

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

    function divest(uint256 proposalId, address user)
        external
        override
        onlyParentTraderPool
        returns (uint256)
    {
        uint256 amount = _divestProposal(proposalId, user);

        emit ProposalDivested(proposalId, user, amount);

        return amount;
    }

    function divestAll(address user) external override onlyParentTraderPool returns (uint256) {
        return _divestAllProposals(user);
    }

    function claim(uint256 proposalId) external override {
        _payout(_divestProposal(proposalId, _msgSender()));
    }

    function claimAll() external override {
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

        emit ProposalWithdrawn(proposalId, amount, msg.sender);
    }

    function supply(uint256 proposalId, uint256 amount) external override {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        uint256 actualAmount = amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals);

        require(actualAmount > 0, "TPIP: amount is 0");

        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            _msgSender(),
            address(this),
            actualAmount
        );

        _updateCumulativeSum(proposalId, amount);

        emit ProposalSupplied(proposalId, amount, msg.sender);
    }

    function convertToDividends(uint256 proposalId) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        _updateCumulativeSum(proposalId, proposalInfos[proposalId].newInvestedBase);

        emit ProposalWithdrawn(proposalId, proposalInfos[proposalId].newInvestedBase, msg.sender);
        emit ProposalSupplied(proposalId, proposalInfos[proposalId].newInvestedBase, msg.sender);

        delete proposalInfos[proposalId].newInvestedBase;
    }

    function _updateCumulativeSum(uint256 proposalId, uint256 amount) internal {
        proposalInfos[proposalId].cumulativeSum += (amount * PRECISION) / totalSupply(proposalId);
    }

    function _updateFromData(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal returns (uint256 lpTransfer) {
        uint256 lpBalance = _lpBalances[user][proposalId];
        lpTransfer = lpBalance.ratio(amount, balanceOf(user, proposalId)).min(lpBalance);

        _lpBalances[user][proposalId] -= lpTransfer;
        totalLPBalances[user] -= lpTransfer;
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal override returns (uint256 lpTransfer) {
        if (balanceOf(user, proposalId) == amount) {
            _activeInvestments[user].remove(proposalId);

            if (_activeInvestments[user].length() == 0) {
                IInvestTraderPool(_parentTraderPoolInfo.parentPoolAddress).checkRemoveInvestor(
                    user
                );
            }
        }

        _updateRewards(proposalId, user);

        return _updateFromData(user, proposalId, amount);
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal override {
        IInvestTraderPool(_parentTraderPoolInfo.parentPoolAddress).checkNewInvestor(user);

        _updateRewards(proposalId, user);

        _lpBalances[user][proposalId] += lpAmount;
        totalLPBalances[user] += lpAmount;
    }
}
