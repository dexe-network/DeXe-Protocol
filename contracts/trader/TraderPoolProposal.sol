// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/trader/ITraderPoolProposal.sol";

import "../libs/MathHelper.sol";

import "../helpers/AbstractDependant.sol";

abstract contract TraderPoolProposal is
    ITraderPoolProposal,
    ERC1155SupplyUpgradeable,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using MathHelper for uint256;

    ParentTraderPoolInfo internal _parentTraderPoolInfo;

    uint256 public proposalsTotalNum;

    uint256 public override totalLockedLP;
    uint256 public override totalInvestedBase;

    mapping(address => EnumerableSet.UintSet) internal _activeInvestments; // user => proposals
    mapping(address => mapping(uint256 => uint256)) internal _lpInvestments; // user => proposal id => LP invested
    mapping(address => uint256) public override totalLPInvestments; // user => LP invested

    modifier onlyParentTraderPool() {
        require(msg.sender == _parentTraderPoolInfo.parentPoolAddress, "TPP: not a ParentPool");
        _;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
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

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal returns (uint256 lpTransfer) {
        lpTransfer = _lpInvestments[user][proposalId].ratio(amount, balanceOf(user, proposalId));

        _lpInvestments[user][proposalId] -= lpTransfer;
        totalLPInvestments[user] -= lpTransfer;

        if (balanceOf(user, proposalId) - amount == 0) {
            _activeInvestments[user].remove(proposalId);
        }
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
