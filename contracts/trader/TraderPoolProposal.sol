// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";
import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";
import "../interfaces/trader/ITraderPoolMemberHook.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/math/MathHelper.sol";

import "./TraderPool.sol";

abstract contract TraderPoolProposal is
    ITraderPoolProposal,
    ERC1155SupplyUpgradeable,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using Math for uint256;

    ParentTraderPoolInfo internal _parentTraderPoolInfo;

    IPriceFeed public override priceFeed;

    uint256 public override proposalsTotalNum;

    uint256 public override totalLockedLP;
    uint256 public override investedBase;

    mapping(uint256 => EnumerableSet.AddressSet) internal _investors; // proposal id => investors

    mapping(address => EnumerableSet.UintSet) internal _activeInvestments; // user => proposals
    mapping(address => mapping(uint256 => uint256)) internal _baseBalances; // user => proposal id => base invested
    mapping(address => mapping(uint256 => uint256)) internal _lpBalances; // user => proposal id => LP invested
    mapping(address => uint256) public override totalLPBalances; // user => LP invested

    modifier onlyParentTraderPool() {
        _onlyParentTraderPool();
        _;
    }

    modifier onlyTraderAdmin() {
        _onlyTraderAdmin();
        _;
    }

    modifier onlyBABTHolder() {
        _onlyBABTHolder();
        _;
    }

    function __TraderPoolProposal_init(
        ParentTraderPoolInfo calldata parentTraderPoolInfo
    ) public override onlyInitializing {
        __ERC1155Supply_init();

        _parentTraderPoolInfo = parentTraderPoolInfo;

        IERC20(parentTraderPoolInfo.baseToken).safeApprove(
            parentTraderPoolInfo.parentPoolAddress,
            MAX_UINT
        );
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        priceFeed = IPriceFeed(registry.getPriceFeedContract());
    }

    function getBaseToken() external view override returns (address) {
        return _parentTraderPoolInfo.baseToken;
    }

    function getInvestedBaseInUSD() external view override returns (uint256 investedBaseUSD) {
        (investedBaseUSD, ) = priceFeed.getNormalizedPriceOutUSD(
            _parentTraderPoolInfo.baseToken,
            investedBase
        );
    }

    function getTotalActiveInvestments(address user) external view override returns (uint256) {
        return _activeInvestments[user].length();
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
            baseInvestment.from18(_parentTraderPoolInfo.baseTokenDecimals)
        );

        uint256 baseInProposal = _baseInProposal(proposalId);
        uint256 toMint = baseInvestment;

        if (baseInProposal > 0) {
            toMint = toMint.ratio(totalSupply(proposalId), baseInProposal);
        }

        totalLockedLP += lpInvestment;
        investedBase += baseInvestment;

        _updateTo(to, proposalId, toMint, lpInvestment, baseInvestment);
        _mint(to, proposalId, toMint, "");
    }

    function _updateFromData(
        address user,
        uint256 proposalId,
        uint256 lp2Amount
    ) internal returns (uint256 lpTransfer, uint256 baseTransfer) {
        mapping(uint256 => uint256) storage baseUserBalance = _baseBalances[user];
        mapping(uint256 => uint256) storage lpUserBalance = _lpBalances[user];

        uint256 baseBalance = baseUserBalance[proposalId];
        uint256 lpBalance = lpUserBalance[proposalId];

        uint256 userBalance = balanceOf(user, proposalId);

        baseTransfer = baseBalance.ratio(lp2Amount, userBalance).min(baseBalance);
        lpTransfer = lpBalance.ratio(lp2Amount, userBalance).min(lpBalance);

        baseUserBalance[proposalId] -= baseTransfer;
        lpUserBalance[proposalId] -= lpTransfer;
        totalLPBalances[user] -= lpTransfer;
    }

    function _updateToData(
        address user,
        uint256 proposalId,
        uint256 lpAmount,
        uint256 baseAmount
    ) internal {
        _activeInvestments[user].add(proposalId);

        _baseBalances[user][proposalId] += baseAmount;
        _lpBalances[user][proposalId] += lpAmount;
        totalLPBalances[user] += lpAmount;
    }

    function _checkLeave(address user, uint256 proposalId, uint256 lp2Amount) internal {
        if (balanceOf(user, proposalId) == lp2Amount) {
            EnumerableSet.UintSet storage activeInvestments = _activeInvestments[user];
            activeInvestments.remove(proposalId);

            if (user != _parentTraderPoolInfo.trader) {
                _investors[proposalId].remove(user);
            }

            if (activeInvestments.length() == 0) {
                ITraderPoolMemberHook(_parentTraderPoolInfo.parentPoolAddress).checkLeave(user);
            }

            emit ProposalLeft(proposalId, user);
        }
    }

    function _checkJoin(address user, uint256 proposalId) internal {
        if (balanceOf(user, proposalId) == 0) {
            if (user != _parentTraderPoolInfo.trader) {
                _investors[proposalId].add(user);
            }

            ITraderPoolMemberHook(_parentTraderPoolInfo.parentPoolAddress).checkJoin(user);

            emit ProposalJoined(proposalId, user);
        }
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        bool isTransfer
    ) internal virtual returns (uint256 lpTransfer, uint256 baseTransfer) {
        (lpTransfer, baseTransfer) = _updateFromData(user, proposalId, lp2Amount);

        if (isTransfer) {
            emit ProposalDivested(proposalId, user, lp2Amount, lpTransfer, baseTransfer);
        }

        _checkLeave(user, proposalId, lp2Amount);
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        uint256 lpAmount,
        uint256 baseAmount
    ) internal virtual {
        _checkJoin(user, proposalId);
        _updateToData(user, proposalId, lpAmount, baseAmount);

        emit ProposalInvested(proposalId, user, lpAmount, baseAmount, lp2Amount);
    }

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
                (uint256 lpTransfer, uint256 baseTransfer) = _updateFrom(
                    from,
                    ids[i],
                    amounts[i],
                    true
                );
                _updateTo(to, ids[i], amounts[i], lpTransfer, baseTransfer);
            }
        }
    }

    function _baseInProposal(uint256 proposalId) internal view virtual returns (uint256);

    function _onlyParentTraderPool() internal view {
        require(msg.sender == _parentTraderPoolInfo.parentPoolAddress, "TPP: not a ParentPool");
    }

    function _onlyTraderAdmin() internal view {
        require(
            TraderPool(_parentTraderPoolInfo.parentPoolAddress).isTraderAdmin(msg.sender),
            "TPP: not a trader admin"
        );
    }

    function _onlyBABTHolder() internal view {
        require(
            TraderPool(_parentTraderPoolInfo.parentPoolAddress).isBABTHolder(msg.sender),
            "TPP: not BABT holder"
        );
    }

    uint256[38] private _gap;
}
