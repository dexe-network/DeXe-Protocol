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
    mapping(address => uint256) internal _amountToSell;

    modifier onlyGov() {
        require(govAddress == address(0) || msg.sender == govAddress, "TSP: not a Gov contract");
        _;
    }

    modifier ifTierExists(uint256 tierId) {
        require(_tiers[tierId].tierInfo.exists, "TSP: tier does not exist");
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

    function createTiers(TierView[] calldata tiers) external override onlyGov {
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

        Tier storage tier = _tiers[tierId];

        _amountToSell[tier.tierView.saleTokenAddress] -= saleTokenAmount;

        tier.tierView.saleTokenAddress.sendFunds(
            msg.sender,
            saleTokenAmount.percentage(PERCENTAGE_100 - tier.tierView.vestingPercentage)
        );

        tier.tierInfo.totalSold -= saleTokenAmount;
        tier.tierInfo.customers[msg.sender] = Purchase({
            purchaseTime: block.timestamp,
            vestingAmount: saleTokenAmount.percentage(tier.tierView.vestingPercentage),
            latestVestingWithdraw: 0
        });
    }

    function recover(RecoveringRequest[] calldata requests) external {}

    function getSaleTokenAmount(
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) public view ifTierExists(tierId) returns (uint256) {
        require(amount > 0, "TSP: zero amount");

        Tier storage tier = _tiers[tierId];

        require(tier.tierInfo.customers[msg.sender].purchaseTime == 0, "TSP: cannot buy twice");

        uint256 exchangeRate = tier.tierInfo.rates[tokenToBuyWith];
        require(exchangeRate != 0, "TSP: incorrect token");

        uint256 saleTokenAmount = amount.ratio(exchangeRate, PRECISION);

        require(
            tier.tierView.minAllocationPerUser <= saleTokenAmount &&
                saleTokenAmount <= tier.tierView.maxAllocationPerUser,
            "TSP: wrong allocation"
        );

        require(
            tier.tierInfo.totalSold + saleTokenAmount <= tier.tierView.totalTokenProvided,
            "TSP: insufficient sale token amount"
        );

        return saleTokenAmount;
    }

    function getVestingWithdrawAmounts(
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory) {
        return new uint256[](0);
    }

    function getTiers(uint256 offset, uint256 limit) external view returns (TierView[] memory) {
        return new TierView[](0);
    }

    function _createTier(TierView calldata tierView) private {
        require(tierView.saleTokenAddress != address(0), "TSP: sale token cannot be zero");
        require(tierView.saleTokenAddress != ETHEREUM_ADDRESS, "TSP: cannot sale native currency");

        require(
            tierView.saleStartTime <= tierView.saleEndTime,
            "TSP: saleEndTime is less than saleStartTime"
        );

        require(
            tierView.minAllocationPerUser <= tierView.maxAllocationPerUser &&
                tierView.maxAllocationPerUser <= tierView.totalTokenProvided,
            "TSP: wrong allocation"
        );

        require(tierView.vestingPercentage <= PERCENTAGE_100, "TSP: vestingPercentage > 100%");

        require(tierView.vestingSettings.unlockStep != 0, "TSP: unlockStep cannot be zero");

        _amountToSell[tierView.saleTokenAddress] += tierView.totalTokenProvided;

        require(
            _amountToSell[tierView.saleTokenAddress] >=
                IERC20(tierView.saleTokenAddress).balanceOf(address(this)),
            "TSP: insufficient TSP balance"
        );

        Tier storage tier = _tiers[++latestTierId];

        tier.tierView = tierView;

        TierInfo storage tierInfo = tier.tierInfo;

        tierInfo.exists = true;

        require(
            tierView.purchaseTokenAddresses.length == tierView.exchangeRates.length,
            "TSP: tokens and rates lens mismatch"
        );

        for (uint256 i = 0; i < tierView.purchaseTokenAddresses.length; i++) {
            require(tierView.exchangeRates[i] != 0, "TSP: rate cannot be zero");

            require(
                tierView.purchaseTokenAddresses[i] != address(0),
                "TSP: purchase token cannot be zero"
            );

            require(
                tierInfo.rates[tierView.purchaseTokenAddresses[i]] == 0,
                "TSP: purchase tokens are duplicated"
            );

            tierInfo.rates[tierView.purchaseTokenAddresses[i]] = tierView.exchangeRates[i];
        }
    }

    function _offTier(uint256 tierId) private ifTierExists(tierId) {
        require(!_tiers[tierId].tierInfo.isOff, "TSP: tier is already off");

        _tiers[tierId].tierInfo.isOff = true;
    }
}
