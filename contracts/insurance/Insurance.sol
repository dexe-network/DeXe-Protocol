// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/trader/ITraderPoolRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/contracts-registry/AbstractDependant.sol";

import "../libs/StringSet.sol";
import "../libs/MathHelper.sol";

import "../core/Globals.sol";

contract Insurance is IInsurance, OwnableUpgradeable, AbstractDependant {
    using StringSet for StringSet.Set;
    using Math for uint256;
    using MathHelper for uint256;

    ITraderPoolRegistry internal _traderPoolRegistry;
    ERC20 internal _dexe;
    ICoreProperties internal _coreProperties;

    mapping(address => uint256) public userStakes;
    mapping(address => mapping(uint256 => uint256)) internal _depositOnBlocks; // user => blocknum => deposit
    mapping(string => FinishedClaims) internal _finishedClaimsInfo;

    mapping(address => uint256) public lastProposal; // user => timestamp

    StringSet.Set internal _finishedClaims;
    StringSet.Set internal _ongoingClaims;

    uint256 public totalPool; // tokens only from pools

    event Deposited(uint256 amount, address investor);
    event Withdrawn(uint256 amount, address investor);
    event Paidout(uint256 amount, address investor);

    modifier onlyTraderPool() {
        require(_traderPoolRegistry.isPool(_msgSender()), "Insurance: Not a trader pool");
        _;
    }

    modifier onlyOncePerDay(address user) {
        require(
            lastProposal[user] + 1 days <= block.timestamp,
            "Insurance: Proposal once per day"
        );
        _;
        lastProposal[user] = block.timestamp;
    }

    function __Insurance_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _traderPoolRegistry = ITraderPoolRegistry(registry.getTraderPoolRegistryContract());
        _dexe = ERC20(registry.getDEXEContract());
        _coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function receiveDexeFromPools(uint256 amount) external override onlyTraderPool {
        totalPool += amount;
    }

    function buyInsurance(uint256 deposit) external override {
        require(
            deposit >= _coreProperties.getMinInsuranceDeposit(),
            "Insurance: deposit must be 10 or more"
        );

        userStakes[_msgSender()] += deposit;
        _depositOnBlocks[_msgSender()][block.number] += deposit;

        _dexe.transferFrom(_msgSender(), address(this), deposit);

        emit Deposited(deposit, _msgSender());
    }

    function getReceivedInsurance(uint256 deposit) external view override returns (uint256) {
        return deposit * _coreProperties.getInsuranceFactor();
    }

    function withdraw(uint256 amountToWithdraw) external override {
        uint256 availableAmount = userStakes[_msgSender()] -
            _depositOnBlocks[_msgSender()][block.number];

        require(availableAmount >= amountToWithdraw, "Insurance: out of available amount");

        userStakes[_msgSender()] -= amountToWithdraw;

        _dexe.transfer(_msgSender(), amountToWithdraw);

        emit Withdrawn(amountToWithdraw, _msgSender());
    }

    function proposeClaim(string calldata url) external override onlyOncePerDay(_msgSender()) {
        require(userStakes[_msgSender()] != 0, "Insurance: deposit is 0");
        require(
            !_ongoingClaims.contains(url) && !_finishedClaims.contains(url),
            "Insurance: Url is not unique"
        );

        _ongoingClaims.add(url);
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
        uint256 to = (offset + limit).min(_ongoingClaims.length()).max(offset);

        urls = new string[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            urls[i - offset] = _ongoingClaims.at(i);
        }
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
        uint256 to = (offset + limit).min(_finishedClaims.length()).max(offset);

        urls = new string[](to - offset);
        info = new FinishedClaims[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            string memory value = _finishedClaims.at(i);

            urls[i - offset] = value;
            info[i - offset] = _finishedClaimsInfo[value];
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
            uint256 userBalance = userStakes[users[i]] * _coreProperties.getInsuranceFactor();

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
        uint256 deposit = userStakes[user];

        return (deposit, deposit * _coreProperties.getInsuranceFactor());
    }

    function _payout(address user, uint256 toPayFromPool) internal returns (uint256) {
        uint256 userStakePayout = toPayFromPool / _coreProperties.getInsuranceFactor();
        uint256 payout = toPayFromPool + userStakePayout;

        _dexe.transfer(user, payout);

        userStakes[user] -= userStakePayout;

        emit Paidout(payout, user);

        return payout;
    }
}
