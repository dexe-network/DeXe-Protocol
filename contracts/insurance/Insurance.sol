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

    mapping(address => UserInfo) public userInfos;

    ERC20 internal _dexe;
    ICoreProperties internal _coreProperties;

    uint256 internal _poolReserved;

    mapping(string => AcceptedClaims) internal _acceptedClaimsInfo;

    StringSet.Set internal _acceptedClaims;

    function __Insurance_init() external override initializer {
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

    function acceptClaim(
        string calldata url,
        address[] calldata users,
        uint256[] memory amounts
    ) external override onlyOwner {
        require(!_acceptedClaims.contains(url), "Insurance: claim already accepted");
        require(users.length == amounts.length, "Insurance: length mismatch");

        uint256 insuranceToPay;

        for (uint256 i = 0; i < amounts.length; i++) {
            insuranceToPay += amounts[i];
        }

        uint256 accessiblePool = getMaxTreasuryPayout();

        for (uint256 i = 0; i < amounts.length; i++) {
            if (insuranceToPay >= accessiblePool) {
                amounts[i] = amounts[i].ratio(accessiblePool, insuranceToPay);
            }

            amounts[i] = _payout(users[i], amounts[i]);
        }

        _acceptedClaims.add(url);
        _acceptedClaimsInfo[url] = AcceptedClaims(users, amounts);
    }

    function getReceivedInsurance(uint256 deposit) public view override returns (uint256) {
        return deposit * _coreProperties.getInsuranceFactor();
    }

    function getMaxTreasuryPayout() public view override returns (uint256) {
        return
            (address(_dexe).thisBalance() - _poolReserved).percentage(
                _coreProperties.getMaxInsurancePoolShare()
            );
    }

    function getInsurance(address user) external view override returns (uint256, uint256) {
        uint256 deposit = userInfos[user].stake;

        return (deposit, getReceivedInsurance(deposit));
    }

    function acceptedClaimsCount() external view override returns (uint256) {
        return _acceptedClaims.length();
    }

    function listAcceptedClaims(
        uint256 offset,
        uint256 limit
    ) external view override returns (string[] memory urls, AcceptedClaims[] memory info) {
        urls = _acceptedClaims.part(offset, limit);

        info = new AcceptedClaims[](urls.length);

        for (uint256 i = 0; i < urls.length; i++) {
            info[i] = _acceptedClaimsInfo[urls[i]];
        }
    }

    function _payout(address user, uint256 insurancePayout) internal returns (uint256 payout) {
        UserInfo storage userInfo = userInfos[user];

        uint256 stakePayout = (insurancePayout / _coreProperties.getInsuranceFactor()).min(
            userInfo.stake
        );
        payout = stakePayout + insurancePayout;

        _poolReserved -= stakePayout;

        userInfo.stake -= stakePayout;

        _dexe.transfer(user, payout);

        emit Paidout(payout, stakePayout, user);
    }
}
