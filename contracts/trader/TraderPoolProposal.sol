// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";
import "../interfaces/trader/ITraderPoolInvestorsHook.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/contracts-registry/AbstractDependant.sol";

import "../libs/MathHelper.sol";
import "../libs/DecimalsConverter.sol";

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

    uint256 public proposalsTotalNum;

    uint256 public override totalLockedLP;
    uint256 public override investedBase;

    mapping(uint256 => EnumerableSet.AddressSet) internal _investors; // proposal id => investors

    mapping(address => EnumerableSet.UintSet) internal _activeInvestments; // user => proposals
    mapping(address => mapping(uint256 => uint256)) internal _baseBalances; // user => proposal id => base invested
    mapping(address => mapping(uint256 => uint256)) internal _lpBalances; // user => proposal id => LP invested
    mapping(address => uint256) public override totalLPBalances; // user => LP invested

    event ProposalInvested(
        uint256 proposalId,
        address user,
        uint256 investedLP,
        uint256 investedBase,
        uint256 receivedLP2
    );
    event ProposalDivested(
        uint256 proposalId,
        address user,
        uint256 divestedLP2,
        uint256 receivedLP,
        uint256 receivedBase
    );

    modifier onlyParentTraderPool() {
        _onlyParentTraderPool();
        _;
    }

    function _onlyParentTraderPool() internal view {
        require(_msgSender() == _parentTraderPoolInfo.parentPoolAddress, "TPP: not a ParentPool");
    }

    modifier onlyTraderAdmin() {
        _onlyTraderAdmin();
        _;
    }

    function _onlyTraderAdmin() internal view {
        require(
            TraderPool(_parentTraderPoolInfo.parentPoolAddress).isTraderAdmin(_msgSender()),
            "TPP: not a trader admin"
        );
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

        _mint(to, proposalId, toMint, "");
        _updateTo(to, proposalId, toMint, lpInvestment, baseInvestment);
    }

    function _updateFromData(
        address user,
        uint256 proposalId,
        uint256 lp2Amount
    ) internal returns (uint256 lpTransfer, uint256 baseTransfer) {
        uint256 baseBalance = _baseBalances[user][proposalId];
        uint256 lpBalance = _lpBalances[user][proposalId];

        baseTransfer = baseBalance.ratio(lp2Amount, balanceOf(user, proposalId)).min(baseBalance);
        lpTransfer = lpBalance.ratio(lp2Amount, balanceOf(user, proposalId)).min(lpBalance);

        _baseBalances[user][proposalId] -= baseTransfer;
        _lpBalances[user][proposalId] -= lpTransfer;
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

    function _checkRemoveInvestor(
        address user,
        uint256 proposalId,
        uint256 lp2Amount
    ) internal {
        if (balanceOf(user, proposalId) == lp2Amount) {
            _activeInvestments[user].remove(proposalId);

            if (user != _parentTraderPoolInfo.trader) {
                _investors[proposalId].remove(user);

                if (_activeInvestments[user].length() == 0) {
                    ITraderPoolInvestorsHook(_parentTraderPoolInfo.parentPoolAddress)
                        .checkRemoveInvestor(user);
                }
            }
        }
    }

    function _checkNewInvestor(address user, uint256 proposalId) internal {
        if (user != _parentTraderPoolInfo.trader) {
            _investors[proposalId].add(user);
            ITraderPoolInvestorsHook(_parentTraderPoolInfo.parentPoolAddress).checkNewInvestor(
                user
            );
        }
    }

    function _updateFrom(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        bool isTransfer
    ) internal virtual returns (uint256 lpTransfer, uint256 baseTransfer) {
        _checkRemoveInvestor(user, proposalId, lp2Amount);
        (lpTransfer, baseTransfer) = _updateFromData(user, proposalId, lp2Amount);

        if (isTransfer) {
            emit ProposalDivested(proposalId, user, lp2Amount, lpTransfer, baseTransfer);
        }
    }

    function _updateTo(
        address user,
        uint256 proposalId,
        uint256 lp2Amount,
        uint256 lpAmount,
        uint256 baseAmount
    ) internal virtual {
        _checkNewInvestor(user, proposalId);
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
}
