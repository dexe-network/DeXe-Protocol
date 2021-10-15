// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/trader/ITraderPoolRegistry.sol";
import "../helpers/AbstractDependant.sol";
import "../libs/StringSet.sol";

contract Insurance is IInsurance, AbstractDependant, OwnableUpgradeable {
    using StringSet for StringSet.Set;
    uint256 public constant DEPOSIT_MULTIPLIER = 10;

    ITraderPoolRegistry internal _traderPoolRegistry;
    ERC20 internal _dexe;

    mapping(address => uint256) public userStakes;
    mapping(address => mapping(uint256 => uint256)) internal _depositOnBlocks; // user => blocknum => deposit
    mapping(string => FinishedClaims) internal _finishedClaimsInfo;

    mapping(address => uint256) public _lastPropose; // user => timestamp

    StringSet.Set internal _finishedClaims;
    StringSet.Set internal _ongoingClaims;

    struct FinishedClaims {
        address[] claimers;
        uint256[] amounts;
        ClaimStatus status;
    }

    enum ClaimStatus {
        NULL,
        ACCEPTED,
        REJECTED
    }

    uint256 public totalPool; // tokens only from pools
    uint256 public decimal;

    modifier onlyTraderPool() {
        require(_traderPoolRegistry.isPool(_msgSender()), "Insurance: Not a trader pool");
        _;
    }

    modifier onlyOncePerDay(address user) {
        require(_lastPropose[user] + 1 days <= block.timestamp, "Insurance: Propose once per day");
        _;
        _lastPropose[user] = block.timestamp;
    }

    function __Insurance_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _traderPoolRegistry = ITraderPoolRegistry(
            contractsRegistry.getTraderPoolRegistryContract()
        );

        _dexe = ERC20(contractsRegistry.getDEXEContract());
        decimal = 10**_dexe.decimals();
    }

    function receiveDexeFromPools(uint256 amount) external override onlyTraderPool {
        totalPool += amount;
    }

    function buyInsurance(uint256 insuranceAmount) external {
        require(insuranceAmount >= 10 * decimal, "Insurance: insuranceAmount must be 10 or more");
        userStakes[_msgSender()] += insuranceAmount;
        _depositOnBlocks[_msgSender()][block.number] = insuranceAmount;
        _dexe.transferFrom(_msgSender(), address(this), insuranceAmount);
    }

    function withdraw(uint256 amountToWithdraw) external {
        uint256 availableAmount = userStakes[_msgSender()] -
            _depositOnBlocks[_msgSender()][block.number];
        require(availableAmount >= amountToWithdraw, "Insurance: out of available amount");
        userStakes[_msgSender()] -= amountToWithdraw;
        _dexe.transfer(_msgSender(), amountToWithdraw);
    }

    function proposeClaim(string calldata url) external onlyOncePerDay(_msgSender()) {
        require(userStakes[_msgSender()] != 0, "Insurance: deposit is 0");
        require(
            !_ongoingClaims.contains(url) && !_finishedClaims.contains(url),
            "Insurance: Url is not unique"
        );
        _ongoingClaims.add(url);
    }

    function listOngoingClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls)
    {
        uint256 to = Math.max(Math.min(offset + limit, _ongoingClaims.length()), offset);
        urls = new string[](to - offset);
        for (uint256 i = offset; i < to; i++) {
            urls[i - offset] = _ongoingClaims._values[i];
        }
    }

    function listFinishedClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls, FinishedClaims[] memory info)
    {
        uint256 to = Math.max(Math.min(offset + limit, _finishedClaims.length()), offset);
        urls = new string[](to - offset);
        info = new FinishedClaims[](to - offset);
        for (uint256 i = offset; i < to; i++) {
            string memory value = _finishedClaims._values[i];
            urls[i - offset] = value;
            info[i - offset] = _finishedClaimsInfo[value];
        }
    }

    function acceptClaim(
        string calldata url,
        address[] calldata users,
        uint256[] memory amounts
    ) external onlyOwner {
        require(_ongoingClaims.contains(url), "Insurance: url is not ongoing");

        uint256 totalToPay;

        for (uint256 i; i < amounts.length; i++) {
            uint256 userBalance = userStakes[users[i]] * DEPOSIT_MULTIPLIER;
            amounts[i] = Math.min(amounts[i], userBalance);
            totalToPay += amounts[i];
        }

        uint256 accessiblePool = totalPool / 3;

        if (totalToPay >= accessiblePool) {
            uint256 paid;
            for (uint256 i; i < amounts.length; i++) {
                uint256 toPay = (accessiblePool * _getProportionalPart(amounts[i], totalToPay)) /
                    decimal;
                _payout(users[i], toPay);
                amounts[i] = toPay + (toPay / DEPOSIT_MULTIPLIER);
                paid += toPay;
            }
            totalPool -= paid;
        } else {
            for (uint256 i; i < amounts.length; i++) {
                _payout(users[i], amounts[i]);
                amounts[i] += amounts[i] / DEPOSIT_MULTIPLIER;
            }
            totalPool -= totalToPay;
        }
        _finishedClaims.add(url);
        _finishedClaimsInfo[url] = FinishedClaims(users, amounts, ClaimStatus.ACCEPTED);
        _ongoingClaims.remove(url);
    }

    function rejectClaim(string calldata url) external onlyOwner {
        require(_ongoingClaims.contains(url), "Insurance: url is not ongoing");
        _finishedClaims.add(url);
        _finishedClaimsInfo[url] = FinishedClaims(
            new address[](0),
            new uint256[](0),
            ClaimStatus.REJECTED
        );
        _ongoingClaims.remove(url);
    }

    function getInsurance() external view returns (uint256, uint256) {
        uint256 deposit = userStakes[_msgSender()];
        return (deposit, deposit * DEPOSIT_MULTIPLIER);
    }

    function _getProportionalPart(uint256 amount, uint256 total) internal view returns (uint256) {
        return (amount * decimal) / total;
    }

    function _payout(address user, uint256 amount) internal {
        _dexe.transfer(user, amount + (amount / DEPOSIT_MULTIPLIER)); // transfer tokens from totalPool
        userStakes[user] -= amount / DEPOSIT_MULTIPLIER; // remove "used tokens"
    }
}
