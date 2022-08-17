// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";
import "@dlsl/dev-modules/libs/data-structures/StringSet.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/factory/IPoolRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/math/MathHelper.sol";

import "../core/Globals.sol";

contract Insurance is IInsurance, OwnableUpgradeable, AbstractDependant {
    using StringSet for StringSet.Set;
    using Paginator for StringSet.Set;
    using Math for uint256;
    using MathHelper for uint256;

    IPoolRegistry internal _poolRegistry;
    ERC20 internal _dexe;
    ICoreProperties internal _coreProperties;

    mapping(address => UserInfo) public userInfos;
    mapping(string => FinishedClaims) internal _finishedClaimsInfo;

    StringSet.Set internal _finishedClaims;
    StringSet.Set internal _ongoingClaims;

    uint256 public totalPool; // tokens only from pools

    event ProposedClaim(address sender, string url);
    event Deposited(uint256 amount, address investor);
    event Withdrawn(uint256 amount, address investor);
    event Paidout(uint256 insurancePayout, uint256 userStakePayout, address investor);

    modifier onlyTraderPool() {
        require(_poolRegistry.isTraderPool(_msgSender()), "Insurance: Not a trader pool");
        _;
    }

    modifier onlyOncePerDay(address user) {
        require(
            userInfos[user].lastProposalTimestamp + 1 days <= block.timestamp,
            "Insurance: Proposal once per day"
        );
        _;
        userInfos[user].lastProposalTimestamp = block.timestamp;
    }

    function __Insurance_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolRegistry = IPoolRegistry(registry.getPoolRegistryContract());
        _dexe = ERC20(registry.getDEXEContract());
        _coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function receiveDexeFromPools(uint256 amount) external override onlyTraderPool {
        totalPool += amount;
    }

    function buyInsurance(uint256 deposit) external override {
        require(
            deposit >= _coreProperties.getMinInsuranceDeposit(),
            "Insurance: deposit is less than min"
        );

        userInfos[_msgSender()].stake += deposit;
        userInfos[_msgSender()].lastDepositTimestamp = block.timestamp;

        _dexe.transferFrom(_msgSender(), address(this), deposit);

        emit Deposited(deposit, _msgSender());
    }

    function getReceivedInsurance(uint256 deposit) external view override returns (uint256) {
        return deposit * _coreProperties.getInsuranceFactor();
    }

    function withdraw(uint256 amountToWithdraw) external override {
        UserInfo storage userInfo = userInfos[_msgSender()];

        require(
            userInfo.lastDepositTimestamp + _coreProperties.getInsuranceWithdrawalLock() <
                block.timestamp,
            "Insurance: lock is not over"
        );
        require(userInfo.stake >= amountToWithdraw, "Insurance: out of available amount");

        userInfo.stake -= amountToWithdraw;

        _dexe.transfer(_msgSender(), amountToWithdraw);

        emit Withdrawn(amountToWithdraw, _msgSender());
    }

    function proposeClaim(string calldata url) external override onlyOncePerDay(_msgSender()) {
        require(
            userInfos[_msgSender()].stake >= _coreProperties.getMinInsuranceProposalAmount(),
            "Insurance: not enough deposit"
        );
        require(
            !_ongoingClaims.contains(url) && !_finishedClaims.contains(url),
            "Insurance: Url is not unique"
        );

        _ongoingClaims.add(url);

        emit ProposedClaim(_msgSender(), url);
    }

    function ongoingClaimsCount() external view override returns (uint256) {
        return _ongoingClaims.length();
    }

    function listOngoingClaims(uint256 offset, uint256 limit)
        external
        view
        override
        returns (string[] memory urls)
    {
        return _ongoingClaims.part(offset, limit);
    }

    function finishedClaimsCount() external view override returns (uint256) {
        return _finishedClaims.length();
    }

    function listFinishedClaims(uint256 offset, uint256 limit)
        external
        view
        override
        returns (string[] memory urls, FinishedClaims[] memory info)
    {
        urls = _finishedClaims.part(offset, limit);

        info = new FinishedClaims[](urls.length);

        for (uint256 i = 0; i < urls.length; i++) {
            info[i] = _finishedClaimsInfo[urls[i]];
        }
    }

    function acceptClaim(
        string calldata url,
        address[] calldata users,
        uint256[] memory amounts
    ) external override onlyOwner {
        require(_ongoingClaims.contains(url), "Insurance: invalid claim url");
        require(users.length == amounts.length, "Insurance: length mismatch");

        uint256 totalToPay;

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 userBalance = userInfos[users[i]].stake * _coreProperties.getInsuranceFactor();

            amounts[i] = amounts[i].min(userBalance);
            totalToPay += amounts[i];
        }

        uint256 accessiblePool = totalPool / _coreProperties.getMaxInsurancePoolShare();

        if (totalToPay >= accessiblePool) {
            for (uint256 i = 0; i < amounts.length; i++) {
                amounts[i] = _payout(users[i], accessiblePool.ratio(amounts[i], totalToPay));
            }
        } else {
            for (uint256 i = 0; i < amounts.length; i++) {
                amounts[i] = _payout(users[i], amounts[i]);
            }
        }

        totalPool -= totalToPay.min(accessiblePool);

        _finishedClaims.add(url);
        _finishedClaimsInfo[url] = FinishedClaims(users, amounts, ClaimStatus.ACCEPTED);

        _ongoingClaims.remove(url);
    }

    function rejectClaim(string calldata url) external override onlyOwner {
        require(_ongoingClaims.contains(url), "Insurance: url is not ongoing");

        _finishedClaims.add(url);
        _finishedClaimsInfo[url] = FinishedClaims(
            new address[](0),
            new uint256[](0),
            ClaimStatus.REJECTED
        );

        _ongoingClaims.remove(url);
    }

    function getInsurance(address user) external view override returns (uint256, uint256) {
        uint256 deposit = userInfos[user].stake;

        return (deposit, deposit * _coreProperties.getInsuranceFactor());
    }

    function _payout(address user, uint256 toPayFromPool) internal returns (uint256) {
        uint256 userStakePayout = toPayFromPool / _coreProperties.getInsuranceFactor();
        uint256 payout = toPayFromPool + userStakePayout;

        _dexe.transfer(user, payout);

        userInfos[user].stake -= userStakePayout;

        emit Paidout(payout, userStakePayout, user);

        return payout;
    }
}
