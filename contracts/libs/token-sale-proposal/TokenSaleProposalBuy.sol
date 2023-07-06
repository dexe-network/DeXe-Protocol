// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../gov/proposals/TokenSaleProposal.sol";

import "../../libs/math/MathHelper.sol";
import "./TokenSaleProposalDecode.sol";

library TokenSaleProposalBuy {
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20;
    using TokenSaleProposalDecode for ITokenSaleProposal.Tier;
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    function buy(
        ITokenSaleProposal.Tier storage tier,
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) external {
        ITokenSaleProposal.UserInfo storage userInfo = tier.users[msg.sender];
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = userInfo.purchaseInfo;
        ITokenSaleProposal.TierInitParams memory tierInitParams = tier.tierInitParams;

        bool isNativeCurrency = tokenToBuyWith == ETHEREUM_ADDRESS;
        uint256 saleTokenAmount = getSaleTokenAmount(
            tier,
            msg.sender,
            tierId,
            tokenToBuyWith,
            isNativeCurrency ? msg.value : amount
        );

        uint256 vestingCurrentAmount = saleTokenAmount.percentage(
            tierInitParams.vestingSettings.vestingPercentage
        );
        uint256 claimCurrentAmount = saleTokenAmount - vestingCurrentAmount;

        tier.tierInfo.totalSold += saleTokenAmount;

        uint256 newSpentAmount = purchaseInfo.spentAmounts.get(tokenToBuyWith) + amount;
        purchaseInfo.spentAmounts.set(tokenToBuyWith, newSpentAmount);
        purchaseInfo.claimTotalAmount += claimCurrentAmount;

        userInfo.vestingUserInfo.vestingTotalAmount += vestingCurrentAmount;

        address govAddress = TokenSaleProposal(address(this)).govAddress();

        if (isNativeCurrency) {
            (bool success, ) = govAddress.call{value: msg.value}("");
            require(success, "TSP: failed to transfer ether");
        } else {
            IERC20(tokenToBuyWith).safeTransferFrom(
                msg.sender,
                govAddress,
                amount.from18(ERC20(tokenToBuyWith).decimals())
            );
        }
    }

    function getSaleTokenAmount(
        ITokenSaleProposal.Tier storage tier,
        address user,
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) public view returns (uint256) {
        ITokenSaleProposal.TierInitParams memory tierInitParams = tier.tierInitParams;

        require(amount > 0, "TSP: zero amount");
        require(canParticipate(tier, tierId, user), "TSP: not whitelisted");
        require(
            tierInitParams.saleStartTime <= block.timestamp &&
                block.timestamp <= tierInitParams.saleEndTime,
            "TSP: cannot buy now"
        );

        uint256 exchangeRate = tier.rates[tokenToBuyWith];
        uint256 saleTokenAmount = amount.ratio(exchangeRate, PRECISION);

        require(saleTokenAmount != 0, "TSP: incorrect token");
        require(
            tierInitParams.maxAllocationPerUser == 0 ||
                (tierInitParams.minAllocationPerUser <= saleTokenAmount &&
                    saleTokenAmount <= tierInitParams.maxAllocationPerUser),
            "TSP: wrong allocation"
        );
        require(
            tier.tierInfo.totalSold + saleTokenAmount <= tierInitParams.totalTokenProvided,
            "TSP: insufficient sale token amount"
        );
        require(
            IERC20(tierInitParams.saleTokenAddress).balanceOf(address(this)).to18(
                ERC20(tierInitParams.saleTokenAddress).decimals()
            ) >= saleTokenAmount,
            "TSP: insufficient contract balance"
        );

        return saleTokenAmount;
    }

    function canParticipate(
        ITokenSaleProposal.Tier storage tier,
        uint256 tierId,
        address user
    ) public view returns (bool _canParticipate) {
        ITokenSaleProposal.ParticipationType participationType = tier
            .tierInitParams
            .participationDetails
            .participationType;
        TokenSaleProposal tokenSaleProposal = TokenSaleProposal(address(this));

        if (participationType == ITokenSaleProposal.ParticipationType.DAOVotes) {
            (, address govUserKeeper, , ) = IGovPool(tokenSaleProposal.govAddress())
                .getHelperContracts();
            _canParticipate =
                IGovUserKeeper(govUserKeeper)
                .votingPower(
                    _asSingletonArray(msg.sender),
                    _asSingletonArray(false),
                    _asSingletonArray(true)
                )[0].power >
                tier.decodeDAOVotes();
        } else if (participationType == ITokenSaleProposal.ParticipationType.Whitelist) {
            _canParticipate = tokenSaleProposal.balanceOf(msg.sender, tierId) > 0;
        } else if (participationType == ITokenSaleProposal.ParticipationType.BABT) {
            _canParticipate = tokenSaleProposal.babt().balanceOf(msg.sender) > 0;
        } else {
            ITokenSaleProposal.PurchaseInfo storage purchaseInfo = tier.users[user].purchaseInfo;

            if (participationType == ITokenSaleProposal.ParticipationType.TokenLock) {
                _canParticipate = purchaseInfo.lockedAmount > 0;
            } else {
                _canParticipate = purchaseInfo.lockedId > 0;
            }
        }
    }

    function getPurchaseView(
        ITokenSaleProposal.Tier storage tier,
        address user
    ) external view returns (ITokenSaleProposal.PurchaseView memory purchaseView) {
        ITokenSaleProposal.UserInfo storage userInfo = tier.users[user];
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = userInfo.purchaseInfo;
        ITokenSaleProposal.TierInitParams memory tierInitParams = tier.tierInitParams;

        purchaseView.isClaimed = purchaseInfo.isClaimed;
        purchaseView.claimUnlockTime =
            tierInitParams.saleEndTime +
            tierInitParams.claimLockDuration;
        purchaseView.canClaim = purchaseView.claimUnlockTime <= block.timestamp;
        purchaseView.claimTotalAmount = purchaseInfo.claimTotalAmount;
        purchaseView.boughtTotalAmount =
            purchaseView.claimTotalAmount +
            userInfo.vestingUserInfo.vestingTotalAmount;
        purchaseView.lockedAmount = purchaseInfo.lockedAmount;
        purchaseView.lockedId = purchaseInfo.lockedId;

        uint256 purchaseTokenLength = purchaseInfo.spentAmounts.length();

        purchaseView.purchaseTokenAddresses = new address[](purchaseTokenLength);
        purchaseView.purchaseTokenAmounts = new uint256[](purchaseTokenLength);

        for (uint256 i = 0; i < purchaseTokenLength; i++) {
            (
                purchaseView.purchaseTokenAddresses[i],
                purchaseView.purchaseTokenAmounts[i]
            ) = purchaseInfo.spentAmounts.at(i);
        }
    }

    function _asSingletonArray(bool element) private pure returns (bool[] memory arr) {
        arr = new bool[](1);
        arr[0] = element;
    }

    function _asSingletonArray(address element) private pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = element;
    }
}
