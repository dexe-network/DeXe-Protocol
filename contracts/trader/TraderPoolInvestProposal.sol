// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/trader/ITraderPoolInvestProposal.sol";
import "../interfaces/trader/IInvestTraderPool.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";
import "@dlsl/dev-modules/libs/arrays/ArrayHelper.sol";

import "../libs/trader/trader-pool-proposal/TraderPoolInvestProposalView.sol";

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

    event ProposalCreated(
        uint256 proposalId,
        ITraderPoolInvestProposal.ProposalLimits proposalLimits
    );
    event ProposalWithdrawn(uint256 proposalId, address sender, uint256 amount);
    event ProposalSupplied(
        uint256 proposalId,
        address sender,
        uint256[] amounts,
        address[] tokens
    );
    event ProposalClaimed(uint256 proposalId, address user, uint256[] amounts, address[] tokens);
    event ProposalConverted(uint256 proposalId, address user, uint256 amount, address baseToken);

    function __TraderPoolInvestProposal_init(
        ParentTraderPoolInfo calldata parentTraderPoolInfo
    ) public initializer {
        __TraderPoolProposal_init(parentTraderPoolInfo);
    }

    function changeProposalRestrictions(
        uint256 proposalId,
        ProposalLimits calldata proposalLimits
    ) external override onlyTraderAdmin onlyBABTHolder {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );

        _proposalInfos[proposalId].proposalLimits = proposalLimits;

        emit ProposalRestrictionsChanged(proposalId, msg.sender);
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

        address trader = _parentTraderPoolInfo.trader;

        _proposalInfos[proposalId].proposalLimits = proposalLimits;

        emit ProposalCreated(proposalId, proposalLimits);

        _transferAndMintLP(proposalId, trader, lpInvestment, baseInvestment);

        _proposalInfos[proposalId].descriptionURL = descriptionURL;
        _proposalInfos[proposalId].lpLocked = lpInvestment;
        _proposalInfos[proposalId].investedBase = baseInvestment;
        _proposalInfos[proposalId].newInvestedBase = baseInvestment;
    }

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external override onlyParentTraderPool {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );

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
    }

    function divest(
        uint256 proposalId,
        address user
    ) external override onlyParentTraderPool returns (uint256 claimedBase) {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );

        (
            uint256 totalClaimed,
            uint256[] memory claimed,
            address[] memory addresses
        ) = _calculateRewards(proposalId, user);

        require(totalClaimed > 0, "TPIP: nothing to divest");

        emit ProposalClaimed(proposalId, user, claimed, addresses);

        if (addresses[0] == _parentTraderPoolInfo.baseToken) {
            claimedBase = claimed[0];
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

    function withdraw(
        uint256 proposalId,
        uint256 amount
    ) external override onlyTraderAdmin onlyBABTHolder {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );
        require(
            amount <= _proposalInfos[proposalId].newInvestedBase,
            "TPIP: withdrawing more than balance"
        );

        _proposalInfos[proposalId].newInvestedBase -= amount;

        IERC20(_parentTraderPoolInfo.baseToken).safeTransfer(
            _parentTraderPoolInfo.trader,
            amount.from18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        emit ProposalWithdrawn(proposalId, msg.sender, amount);
    }

    function supply(
        uint256 proposalId,
        uint256[] calldata amounts,
        address[] calldata addresses
    ) external override onlyTraderAdmin onlyBABTHolder {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );
        require(addresses.length == amounts.length, "TPIP: length mismatch");

        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];
            uint256 actualAmount = amounts[i].from18(ERC20(token).decimals());

            require(actualAmount > 0, "TPIP: amount is 0");

            IERC20(token).safeTransferFrom(msg.sender, address(this), actualAmount);

            _updateCumulativeSum(proposalId, amounts[i], token);
        }

        emit ProposalSupplied(proposalId, msg.sender, amounts, addresses);
    }

    function convertInvestedBaseToDividends(
        uint256 proposalId
    ) external override onlyTraderAdmin onlyBABTHolder {
        require(
            proposalId <= proposalsTotalNum && proposalId != 0,
            "TPIP: proposal doesn't exist"
        );

        uint256 newInvestedBase = _proposalInfos[proposalId].newInvestedBase;
        address baseToken = _parentTraderPoolInfo.baseToken;

        _updateCumulativeSum(proposalId, newInvestedBase, baseToken);

        delete _proposalInfos[proposalId].newInvestedBase;

        emit ProposalConverted(proposalId, msg.sender, newInvestedBase, baseToken);
    }

    function getProposalInfos(
        uint256 offset,
        uint256 limit
    ) external view override returns (ProposalInfoExtended[] memory proposals) {
        return
            TraderPoolInvestProposalView.getProposalInfos(
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
            TraderPoolInvestProposalView.getActiveInvestmentsInfo(
                _activeInvestments[user],
                _baseBalances,
                _lpBalances,
                user,
                offset,
                limit
            );
    }

    function getRewards(
        uint256[] calldata proposalIds,
        address user
    ) external view override returns (Receptions memory receptions) {
        return
            TraderPoolInvestProposalView.getRewards(
                _rewardInfos,
                _userRewardInfos,
                proposalIds,
                user
            );
    }

    function _updateCumulativeSum(uint256 proposalId, uint256 amount, address token) internal {
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

    function _calculateRewards(
        uint256 proposalId,
        address user
    )
        internal
        returns (uint256 totalClaimed, uint256[] memory claimed, address[] memory addresses)
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
            totalClaimed += claimed[i];

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

    function _payout(address user, uint256[] memory claimed, address[] memory addresses) internal {
        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];

            if (token == address(0)) {
                continue;
            }

            IERC20(token).safeTransfer(user, claimed[i].from18(ERC20(token).decimals()));
        }
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        bool isTransfer
    ) internal override returns (uint256 lpTransfer, uint256 baseTransfer) {
        _updateRewards(proposalId, user);

        return super._updateFrom(user, proposalId, lp2Amount, isTransfer);
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        uint256 lpAmount,
        uint256 baseAmount
    ) internal override {
        _updateRewards(proposalId, user);

        super._updateTo(user, proposalId, lp2Amount, lpAmount, baseAmount);
    }

    function _baseInProposal(uint256 proposalId) internal view override returns (uint256) {
        return _proposalInfos[proposalId].investedBase;
    }
}
