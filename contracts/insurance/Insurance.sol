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
import "../libs/utils/TokenBalance.sol";

import "../core/Globals.sol";

contract Insurance is IInsurance, OwnableUpgradeable, AbstractDependant {
    using StringSet for StringSet.Set;
    using Paginator for StringSet.Set;
    using Math for uint256;
    using MathHelper for uint256;
    using TokenBalance for address;

    ERC20 internal _dexe;
    ICoreProperties internal _coreProperties;

    uint256 internal _poolReserved;

    mapping(address => UserInfo) public userInfos;
    mapping(string => FinishedClaims) internal _finishedClaimsInfo;

    StringSet.Set internal _finishedClaims;
    StringSet.Set internal _ongoingClaims;

    event ProposedClaim(address sender, string url);
    event Deposited(uint256 amount, address investor);
    event Withdrawn(uint256 amount, address investor);
    event Paidout(uint256 insurancePayout, uint256 userStakePayout, address investor);

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

        _dexe = ERC20(registry.getDEXEContract());
        _coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function buyInsurance(uint256 deposit) external override {
        require(
            deposit >= _coreProperties.getMinInsuranceDeposit(),
            "Insurance: deposit is less than min"
        );

        _poolReserved += deposit;

        userInfos[msg.sender].stake += deposit;
        userInfos[msg.sender].lastDepositTimestamp = block.timestamp;

        _dexe.transferFrom(msg.sender, address(this), deposit);

        emit Deposited(deposit, msg.sender);
    }

    function getReceivedInsurance(uint256 deposit) public view override returns (uint256) {
        return deposit * _coreProperties.getInsuranceFactor();
    }

    function withdraw(uint256 amountToWithdraw) external override {
        UserInfo storage userInfo = userInfos[msg.sender];

        require(
            userInfo.lastDepositTimestamp + _coreProperties.getInsuranceWithdrawalLock() <
                block.timestamp,
            "Insurance: lock is not over"
        );
        require(userInfo.stake >= amountToWithdraw, "Insurance: out of available amount");

        _poolReserved -= amountToWithdraw;

        userInfo.stake -= amountToWithdraw;

        _dexe.transfer(msg.sender, amountToWithdraw);

        emit Withdrawn(amountToWithdraw, msg.sender);
    }

    function proposeClaim(string calldata url) external override onlyOncePerDay(msg.sender) {
        require(
            userInfos[msg.sender].stake >= _coreProperties.getMinInsuranceProposalAmount(),
            "Insurance: not enough deposit"
        );
        require(
            !_ongoingClaims.contains(url) && !_finishedClaims.contains(url),
            "Insurance: Url is not unique"
        );

        _ongoingClaims.add(url);

        emit ProposedClaim(msg.sender, url);
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

        uint256 insuranceToPay;

        for (uint256 i = 0; i < amounts.length; i++) {
            amounts[i] = amounts[i].min(
                userInfos[users[i]].stake * _coreProperties.getInsuranceFactor()
            );
            insuranceToPay += amounts[i];
        }

        uint256 accessiblePool = getMaxTreasuryPayout();

        for (uint256 i = 0; i < amounts.length; i++) {
            if (insuranceToPay >= accessiblePool) {
                amounts[i] = accessiblePool.ratio(amounts[i], insuranceToPay);
            }

            amounts[i] = _payout(users[i], amounts[i]);
        }

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

        return (deposit, getReceivedInsurance(deposit));
    }

    function getMaxTreasuryPayout() public view override returns (uint256) {
        return
            (address(_dexe).thisBalance() - _poolReserved).percentage(
                _coreProperties.getMaxInsurancePoolShare()
            );
    }

    function _payout(address user, uint256 insurancePayout) internal returns (uint256 payout) {
        uint256 stakePayout = insurancePayout / _coreProperties.getInsuranceFactor();
        payout = stakePayout + insurancePayout;

        _poolReserved -= stakePayout;

        userInfos[user].stake -= stakePayout;

        _dexe.transfer(user, payout);

        emit Paidout(payout, stakePayout, user);
    }
}
