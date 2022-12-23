// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";

import "../../core/Globals.sol";

import "../../libs/utils/TokenBalance.sol";
import "../../libs/math/MathHelper.sol";

contract TokenSaleProposal is ITokenSaleProposal, ERC1155Upgradeable {
    using TokenBalance for address;
    using MathHelper for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;

    address public govAddress;

    uint256 public override latestTierId;

    mapping(uint256 => Tier) internal _tiers;
    mapping(uint256 => TierBackend) internal _tiersBackend;
    mapping(address => uint256) internal _amountToSell;

    modifier onlyGov() {
        require(govAddress == address(0) || msg.sender == govAddress, "TSP: not a Gov contract");
        _;
    }

    modifier ifTierExists(uint256 tierId) {
        require(_tiersBackend[tierId].exists, "TSP: tier does not exist");
        _;
    }

    function __TokenSaleProposal_init(address _govAddress) external initializer {
        govAddress = _govAddress;
    }

    function setGovAddress(address _govAddress) external {
        require(govAddress == address(0), "TSP: govAddress is set");
        require(_govAddress != address(0), "TSP: cannot set zero govAddress");

        govAddress = _govAddress;
    }

    function createTiers(Tier[] calldata tiers) external override onlyGov {
        for (uint256 i = 0; i < tiers.length; i++) {
            _createTier(tiers[i]);
        }
    }

    function addToWhitelist(WhitelistingRequest[] calldata requests) external override {}

    function offTiers(uint256[] calldata tierIds) external override onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _offTier(tierIds[i]);
        }
    }

    function vestingWithdraw(uint256[] calldata tierIds) external override {}

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable {
        bool isNativeCurrency = tokenToBuyWith == ETHEREUM_ADDRESS;

        uint256 saleTokenAmount = getSaleTokenAmount(
            tierId,
            tokenToBuyWith,
            isNativeCurrency ? msg.value : amount
        );

        if (isNativeCurrency) {
            (bool success, ) = govAddress.call{value: msg.value}("");
            require(success, "TSP: failed to transfer ether");
        } else {
            IERC20(tokenToBuyWith).safeTransferFrom(msg.sender, govAddress, amount);
        }

        _amountToSell[_tiers[tierId].saleTokenAddress] -= saleTokenAmount;

        _tiers[tierId].saleTokenAddress.sendFunds(msg.sender, saleTokenAmount);
    }

    function recover(RecoveringRequest[] calldata requests) external {}

    function getSaleTokenAmount(
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) public view ifTierExists(tierId) returns (uint256) {
        require(amount > 0, "TSP: zero amount");

        uint256 exchangeRate = _tiersBackend[tierId].rates[tokenToBuyWith];
        require(exchangeRate != 0, "TSP: incorrect token");

        return amount.ratio(exchangeRate, PRECISION);
    }

    function getVestingWithdrawAmounts(
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory) {
        return new uint256[](0);
    }

    function getTiers(uint256 offset, uint256 limit) external view returns (Tier[] memory) {
        return new Tier[](0);
    }

    function _createTier(Tier calldata tier) private {
        require(tier.saleTokenAddress != address(0), "TSP: sale token cannot be zero");
        require(tier.saleTokenAddress != ETHEREUM_ADDRESS, "TSP: cannot sale native currency");

        require(
            tier.saleStartTime <= tier.saleEndTime,
            "TSP: saleEndTime is less than saleStartTime"
        );

        require(
            tier.minAllocationPerUser <= tier.maxAllocationPerUser &&
                tier.maxAllocationPerUser <= tier.totalTokenProvided,
            "TSP: wrong allocation"
        );

        require(tier.vestingPercentage <= PERCENTAGE_100, "TSP: vestingPercentage > 100%");

        require(tier.vestingSettings.unlockStep != 0, "TSP: unlockStep cannot be zero");

        _amountToSell[tier.saleTokenAddress] += tier.totalTokenProvided;

        require(
            _amountToSell[tier.saleTokenAddress] >=
                IERC20(tier.saleTokenAddress).balanceOf(address(this)),
            "TSP: insufficient TSP balance"
        );

        ++latestTierId;

        _tiers[latestTierId] = tier;

        TierBackend storage tierBackend = _tiersBackend[latestTierId];

        tierBackend.exists = true;

        require(
            tier.purchaseTokenAddresses.length == tier.exchangeRates.length,
            "TSP: tokens and rates lens mismatch"
        );

        for (uint256 i = 0; i < tier.purchaseTokenAddresses.length; i++) {
            require(tier.exchangeRates[i] != 0, "TSP: rate cannot be zero");

            require(
                tier.purchaseTokenAddresses[i] != address(0),
                "TSP: purchase token cannot be zero"
            );

            require(
                tierBackend.rates[tier.purchaseTokenAddresses[i]] == 0,
                "TSP: purchase tokens are duplicated"
            );

            tierBackend.rates[tier.purchaseTokenAddresses[i]] = tier.exchangeRates[i];
        }
    }

    function _offTier(uint256 tierId) private ifTierExists(tierId) {
        require(!_tiersBackend[tierId].isOff, "TSP: tier is already off");

        _tiersBackend[tierId].isOff = true;
    }
}
