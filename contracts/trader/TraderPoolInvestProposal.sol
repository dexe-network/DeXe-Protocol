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
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using TraderPoolInvestProposalView for ParentTraderPoolInfo;

    mapping(uint256 => ProposalInfo) internal _proposalInfos; // proposal id => info
    mapping(uint256 => RewardInfo) internal _rewardInfos; // proposal id => reward info

    mapping(address => mapping(uint256 => UserRewardInfo)) internal _userRewardInfos; // user => proposal id => user reward info

    event ProposalInvested(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalDivested(uint256 index, address investor, uint256 amount);
    event ProposalCreated(uint256 index, ITraderPoolInvestProposal.ProposalLimits proposalLimits);
    event ProposalWithdrawn(uint256 index, uint256 amount, address investor);
    event ProposalSupplied(uint256 index, uint256 amount, address token, address investor);

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

        _proposalInfos[proposalId].proposalLimits = proposalLimits;
    }

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        override
        returns (ProposalInfo[] memory proposals)
    {
        return TraderPoolInvestProposalView.getProposalInfos(_proposalInfos, offset, limit);
    }

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (ActiveInvestmentInfo[] memory investments) {
        return
            TraderPoolInvestProposalView.getActiveInvestmentsInfo(
                _activeInvestments[user],
                _lpBalances,
                user,
                offset,
                limit
            );
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return _proposalInfos[proposalId].investedBase;
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

        _proposalInfos[proposalId].proposalLimits = proposalLimits;

        _transferAndMintLP(proposalId, _parentTraderPoolInfo.trader, lpInvestment, baseInvestment);

        _proposalInfos[proposalId].descriptionURL = descriptionURL;
        _proposalInfos[proposalId].lpLocked = lpInvestment;
        _proposalInfos[proposalId].investedBase = baseInvestment;
        _proposalInfos[proposalId].newInvestedBase = baseInvestment;

        emit ProposalCreated(proposalId, proposalLimits);
        emit ProposalInvested(proposalId, _msgSender(), lpInvestment, baseInvestment);
    }

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        ProposalInfo storage info = _proposalInfos[proposalId];

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
            TraderPoolInvestProposalView.getRewards(
                _rewardInfos,
                _userRewardInfos,
                proposalIds,
                user
            );
    }

    function _payout(
        address user,
        uint256[] memory claimed,
        address[] memory addresses
    ) internal {
        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];

            if (token == address(0)) {
                continue;
            }

            IERC20(token).safeTransfer(user, claimed[i].convertFrom18(ERC20(token).decimals()));
        }
    }

    function _updateCumulativeSum(
        uint256 proposalId,
        uint256 amount,
        address token
    ) internal {
        RewardInfo storage rewardInfo = _rewardInfos[proposalId];

        rewardInfo.rewardTokens.add(token);
        rewardInfo.cumulativeSums[token] += PRECISION.ratio(amount, totalSupply(proposalId));
    }

    function _updateRewards(uint256 proposalId, address user) internal {
        UserRewardInfo storage userRewardInfo = _userRewardInfos[user][proposalId];
        RewardInfo storage rewardInfo = _rewardInfos[proposalId];

        uint256 length = rewardInfo.rewardTokens.length();

        for (uint256 i = 0; i < length; i++) {
            address token = rewardInfo.rewardTokens.at(i);
            uint256 cumulativeSum = rewardInfo.cumulativeSums[token];

            userRewardInfo.rewardsStored[token] +=
                ((cumulativeSum - userRewardInfo.cumulativeSumsStored[token]) *
                    balanceOf(user, proposalId)) /
                PRECISION;
            userRewardInfo.cumulativeSumsStored[token] = cumulativeSum;
        }
    }

    function _calculateRewards(uint256 proposalId, address user)
        internal
        returns (uint256[] memory claimed, address[] memory addresses)
    {
        _updateRewards(proposalId, user);

        RewardInfo storage rewardInfo = _rewardInfos[proposalId];
        uint256 length = rewardInfo.rewardTokens.length();

        claimed = new uint256[](length);
        addresses = new address[](length);

        address baseToken = _parentTraderPoolInfo.baseToken;
        uint256 baseIndex;

        for (uint256 i = 0; i < length; i++) {
            address token = rewardInfo.rewardTokens.at(i);

            claimed[i] = _userRewardInfos[user][proposalId].rewardsStored[token];
            addresses[i] = token;

            delete _userRewardInfos[user][proposalId].rewardsStored[token];

            if (token == baseToken) {
                baseIndex = i;
            }
        }

        if (length > 0) {
            /// @dev make the base token first (if not found, do nothing)
            (claimed[0], claimed[baseIndex]) = (claimed[baseIndex], claimed[0]);
            (addresses[0], addresses[baseIndex]) = (addresses[baseIndex], addresses[0]);
        }
    }

    function _divestProposals(uint256[] memory proposalIds, address user)
        internal
        returns (uint256 claimedBase)
    {
        address baseToken = _parentTraderPoolInfo.baseToken;

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

            (uint256[] memory claimed, address[] memory addresses) = _calculateRewards(
                proposalId,
                user
            );

            if (addresses[0] == baseToken) {
                claimedBase += claimed[0];
                addresses[0] = address(0);

                _proposalInfos[proposalId].lpLocked -= claimed[0].min(
                    _proposalInfos[proposalId].lpLocked
                );

                _updateFromData(user, proposalId, claimed[0]);
                investedBase -= claimed[0].min(investedBase);
                totalLockedLP -= claimed[0].min(totalLockedLP); // intentional base from LP subtraction
            }

            _payout(user, claimed, addresses);
        }

        require(claimedBase > 0, "TPIP: no base to divest");
    }

    function _claimProposals(uint256[] memory proposalIds, address user) internal {
        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

            (uint256[] memory claimed, address[] memory tokens) = _calculateRewards(
                proposalId,
                user
            );

            _payout(user, claimed, tokens);
        }
    }

    function divest(uint256 proposalId, address user)
        external
        override
        onlyParentTraderPool
        returns (uint256 baseAmount)
    {
        uint256[] memory proposals = new uint256[](1);
        proposals[0] = proposalId;

        baseAmount = _divestProposals(proposals, user);

        emit ProposalDivested(proposalId, user, baseAmount);
    }

    function divestAll(address user) external override onlyParentTraderPool returns (uint256) {
        return _divestProposals(_activeInvestments[user].values(), user);
    }

    function claim(uint256 proposalId) external override {
        uint256[] memory proposals = new uint256[](1);
        proposals[0] = proposalId;

        _claimProposals(proposals, _msgSender());
    }

    function claimAll() external override {
        _claimProposals(_activeInvestments[_msgSender()].values(), _msgSender());
    }

    function withdraw(uint256 proposalId, uint256 amount) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");
        require(
            amount <= _proposalInfos[proposalId].newInvestedBase,
            "TPIP: withdrawing more than balance"
        );

        _proposalInfos[proposalId].newInvestedBase -= amount;

        IERC20(_parentTraderPoolInfo.baseToken).safeTransfer(
            _parentTraderPoolInfo.trader,
            amount.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        emit ProposalWithdrawn(proposalId, amount, _msgSender());
    }

    function supply(
        uint256 proposalId,
        uint256[] calldata amounts,
        address[] calldata addresses
    ) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");
        require(addresses.length == amounts.length, "TPIP: length mismatch");

        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];
            uint256 actualAmount = amounts[i].convertFrom18(ERC20(token).decimals());

            require(actualAmount > 0, "TPIP: amount is 0");

            IERC20(token).safeTransferFrom(_msgSender(), address(this), actualAmount);

            _updateCumulativeSum(proposalId, amounts[i], token);

            emit ProposalSupplied(proposalId, amounts[i], token, _msgSender());
        }
    }

    function convertInvestedBaseToDividends(uint256 proposalId) external override onlyTraderAdmin {
        require(proposalId <= proposalsTotalNum, "TPIP: proposal doesn't exist");

        _updateCumulativeSum(
            proposalId,
            _proposalInfos[proposalId].newInvestedBase,
            _parentTraderPoolInfo.baseToken
        );

        emit ProposalWithdrawn(
            proposalId,
            _proposalInfos[proposalId].newInvestedBase,
            _msgSender()
        );
        emit ProposalSupplied(
            proposalId,
            _proposalInfos[proposalId].newInvestedBase,
            _parentTraderPoolInfo.baseToken,
            _msgSender()
        );

        delete _proposalInfos[proposalId].newInvestedBase;
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal override returns (uint256 lpTransfer) {
        _updateRewards(proposalId, user);

        return super._updateFrom(user, proposalId, amount);
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal override {
        _updateRewards(proposalId, user);

        super._updateTo(user, proposalId, lpAmount);
    }
}
