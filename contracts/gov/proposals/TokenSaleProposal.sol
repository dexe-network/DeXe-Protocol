// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";

import "../../core/Globals.sol";

import "../../libs/utils/TokenBalance.sol";
import "../../libs/math/MathHelper.sol";

contract TokenSaleProposal is ITokenSaleProposal, ERC1155Upgradeable {
    using TokenBalance for address;
    using MathHelper for uint256;
    using Math for uint256;
    using DecimalsConverter for uint256;
    using SafeERC20 for ERC20;

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

    function addToWhitelist(WhitelistingRequest[] calldata requests) external override {
        for (uint256 i = 0; i < requests.length; i++) {
            _addToWhitelist(requests[i]);
        }
    }

    function offTiers(uint256[] calldata tierIds) external override onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _offTier(tierIds[i]);
        }
    }

    function vestingWithdraw(uint256[] calldata tierIds) external override {
        uint256[] memory vestingWithdrawAmounts = getVestingWithdrawAmounts(tierIds);

        for (uint256 i = 0; i < tierIds.length; i++) {
            ERC20 saleToken = ERC20(_tiers[i].tierView.saleTokenAddress);

            saleToken.safeTransfer(
                msg.sender,
                vestingWithdrawAmounts[i].from18(saleToken.decimals())
            );
        }
    }

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable {
        bool isNativeCurrency = tokenToBuyWith == ETHEREUM_ADDRESS;

        uint256 saleTokenAmount = getSaleTokenAmount(
            tierId,
            tokenToBuyWith,
            isNativeCurrency ? msg.value : amount
        );

        Tier storage tier = _tiers[tierId];

        TierView memory tierView = tier.tierView;
        TierInfo storage tierInfo = tier.tierInfo;

        _amountToSell[tierView.saleTokenAddress] -= saleTokenAmount;

        tierView.saleTokenAddress.sendFunds(
            msg.sender,
            saleTokenAmount.percentage(PERCENTAGE_100 - tierView.vestingPercentage)
        );

        tierInfo.totalSold += saleTokenAmount;
        tierInfo.customers[msg.sender] = Purchase({
            purchaseTime: block.timestamp,
            vestingAmount: saleTokenAmount.percentage(tierView.vestingPercentage),
            latestVestingWithdraw: block.timestamp
        });

        if (isNativeCurrency) {
            (bool success, ) = govAddress.call{value: msg.value}("");
            require(success, "TSP: failed to transfer ether");
        } else {
            ERC20(tokenToBuyWith).safeTransferFrom(
                msg.sender,
                govAddress,
                amount.from18(ERC20(tokenToBuyWith).decimals())
            );
        }
    }

    function recover(uint256[] calldata tierIds) external {
        uint256[] memory recoveringAmounts = getRecoveringAmounts(tierIds);

        for (uint256 i = 0; i < recoveringAmounts.length; i++) {
            ERC20 saleToken = ERC20(_tiers[tierIds[i]].tierView.saleTokenAddress);

            saleToken.safeTransfer(govAddress, recoveringAmounts[i].from18(saleToken.decimals()));
        }
    }

    function getSaleTokenAmount(
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) public view ifTierExists(tierId) returns (uint256) {
        require(amount > 0, "TSP: zero amount");

        require(balanceOf(msg.sender, tierId) == 1, "TSP: not whitelisted");

        Tier storage tier = _tiers[tierId];

        TierView memory tierView = tier.tierView;
        TierInfo storage tierInfo = tier.tierInfo;

        require(
            tierView.saleStartTime <= block.timestamp && block.timestamp <= tierView.saleEndTime,
            "TSP: cannot buy now"
        );
        require(tierInfo.customers[msg.sender].purchaseTime == 0, "TSP: cannot buy twice");

        uint256 exchangeRate = tierInfo.rates[tokenToBuyWith];
        require(exchangeRate != 0, "TSP: incorrect token");

        uint256 saleTokenAmount = amount.ratio(exchangeRate, PRECISION);

        require(
            tierView.minAllocationPerUser <= saleTokenAmount &&
                saleTokenAmount <= tierView.maxAllocationPerUser,
            "TSP: wrong allocation"
        );

        require(
            tierInfo.totalSold + saleTokenAmount <= tierView.totalTokenProvided,
            "TSP: insufficient sale token amount"
        );

        return saleTokenAmount;
    }

    function getVestingWithdrawAmounts(
        uint256[] calldata tierIds
    ) public view returns (uint256[] memory vestingWithdrawAmounts) {
        vestingWithdrawAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < tierIds.length; i++) {
            vestingWithdrawAmounts[i] = _getVestingWithdrawAmount(tierIds[i]);
        }
    }

    function getRecoveringAmounts(
        uint256[] memory tierIds
    ) public view returns (uint256[] memory recoveringAmounts) {
        recoveringAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < recoveringAmounts.length; i++) {
            recoveringAmounts[i] = _getRecoveringAmount(tierIds[i]);
        }
    }

    function getTiers(uint256 offset, uint256 limit) external view returns (TierView[] memory) {
        return new TierView[](0);
    }

    function _createTier(TierView calldata tierView) internal {
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

    function _addToWhitelist(
        WhitelistingRequest calldata request
    ) internal ifTierExists(request.tierId) {
        for (uint256 i = 0; i < request.users.length; i++) {
            _mint(request.users[i], request.tierId, 1, "");
        }
    }

    function _offTier(uint256 tierId) internal ifTierExists(tierId) {
        TierInfo storage tierInfo = _tiers[tierId].tierInfo;

        require(!tierInfo.isOff, "TSP: tier is already off");

        tierInfo.isOff = true;
    }

    function _getVestingWithdrawAmount(
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (uint256) {
        Tier storage tier = _tiers[tierId];

        TierView memory tierView = tier.tierView;
        TierInfo storage tierInfo = tier.tierInfo;

        if (tierInfo.customers[msg.sender].purchaseTime == 0) {
            return 0;
        }

        VestingSettings memory vestingSettings = tierView.vestingSettings;
        Purchase memory purchase = tierInfo.customers[msg.sender];

        uint256 startTime = purchase.purchaseTime + vestingSettings.cliffPeriod;

        if (startTime > block.timestamp) {
            return 0;
        }

        uint256 stepsCount = vestingSettings.vestingDuration / vestingSettings.unlockStep;
        uint256 tokensPerStep = purchase.vestingAmount / stepsCount;

        uint256 vestingWithdrawAmount = (block.timestamp - purchase.latestVestingWithdraw).ratio(
            tokensPerStep,
            vestingSettings.unlockStep
        );

        purchase.latestVestingWithdraw = block.timestamp;

        return vestingWithdrawAmount;
    }

    function _getRecoveringAmount(
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (uint256) {
        TierView memory tierView = _tiers[tierId].tierView;

        if (block.timestamp <= tierView.saleEndTime) {
            return 0;
        }

        uint256 balanceLeft = tierView.totalTokenProvided - _tiers[tierId].tierInfo.totalSold;

        return
            ERC20(tierView.saleTokenAddress)
                .balanceOf(address(this))
                .to18(ERC20(tierView.saleTokenAddress).decimals())
                .min(balanceLeft);
    }

    function _beforeTokenTransfer(
        address,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory
    ) internal view override {
        require(from == address(0), "TSP: only for minting");

        for (uint256 i = 0; i < ids.length; i++) {
            require(
                balanceOf(to, ids[i]) == 0 && amounts[i] == 1,
                "TSP: balance can be only 0 or 1"
            );
        }
    }
}
