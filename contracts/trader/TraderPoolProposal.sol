// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";

import "../libs/MathHelper.sol";
import "../libs/DecimalsConverter.sol";

import "../helpers/AbstractDependant.sol";
import "./TraderPool.sol";

abstract contract TraderPoolProposal is
    ITraderPoolProposal,
    ERC1155SupplyUpgradeable,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using Math for uint256;

    ParentTraderPoolInfo internal _parentTraderPoolInfo;

    IPriceFeed public override priceFeed;

    uint256 public proposalsTotalNum;

    uint256 public override totalLockedLP;
    uint256 public override investedBase;

    mapping(address => EnumerableSet.UintSet) internal _activeInvestments; // user => proposals
    mapping(address => mapping(uint256 => uint256)) internal _lpBalances; // user => proposal id => LP invested
    mapping(address => uint256) public override totalLPBalances; // user => LP invested

    modifier onlyParentTraderPool() {
        require(_msgSender() == _parentTraderPoolInfo.parentPoolAddress, "TPP: not a ParentPool");
        _;
    }

    modifier onlyTraderAdmin() {
        require(
            TraderPool(_parentTraderPoolInfo.parentPoolAddress).isTraderAdmin(_msgSender()),
            "TPP: not a trader admin"
        );
        _;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        public
        onlyInitializing
    {
        __ERC1155Supply_init();

        _parentTraderPoolInfo = parentTraderPoolInfo;

        IERC20(parentTraderPoolInfo.baseToken).safeApprove(
            parentTraderPoolInfo.parentPoolAddress,
            MAX_UINT
        );
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
    }

    function getBaseToken() external view override returns (address) {
        return _parentTraderPoolInfo.baseToken;
    }

    function getInvestedBaseInUSD() external view override returns (uint256) {
        return priceFeed.getNormalizedPriceOutUSD(_parentTraderPoolInfo.baseToken, investedBase);
    }

    function getTotalActiveInvestments(address user) external view override returns (uint256) {
        return _activeInvestments[user].length();
    }

    function _baseInProposal(uint256 proposalId) internal view virtual returns (uint256);

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

        uint256 baseInProposal = _baseInProposal(proposalId);
        uint256 toMint = baseInvestment;

        if (baseInProposal > 0) {
            toMint = toMint.ratio(totalSupply(proposalId), baseInProposal);
        }

        totalLockedLP += lpInvestment;
        investedBase += baseInvestment;

        _activeInvestments[to].add(proposalId);

        _lpBalances[to][proposalId] += lpInvestment;
        totalLPBalances[to] += lpInvestment;

        _mint(to, proposalId, toMint, "");
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 amount
    ) internal virtual returns (uint256 lpTransfer);

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lpAmount
    ) internal virtual;

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "TPP: 0 transfer");

            if (from != address(0) && to != address(0) && to != from) {
                uint256 lpTransfer = _updateFrom(from, ids[i], amounts[i]);
                _updateTo(to, ids[i], lpTransfer);
            }
        }
    }
}
