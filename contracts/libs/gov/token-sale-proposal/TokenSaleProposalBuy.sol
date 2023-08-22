// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../core/CoreProperties.sol";
import "../../../gov/proposals/TokenSaleProposal.sol";

import "../../../libs/math/MathHelper.sol";
import "./TokenSaleProposalDecode.sol";

library TokenSaleProposalBuy {
    using MathHelper for uint256;
    using DecimalsConverter for *;
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
        ITokenSaleProposal.TierInitParams storage tierInitParams = tier.tierInitParams;

        if (tokenToBuyWith == ETHEREUM_ADDRESS) {
            amount = msg.value;
        }

        uint256 saleTokenAmount = getSaleTokenAmount(
            tier,
            msg.sender,
            tierId,
            tokenToBuyWith,
            amount
        );
        uint256 vestingCurrentAmount = saleTokenAmount.percentage(
            tierInitParams.vestingSettings.vestingPercentage
        );
        uint256 claimCurrentAmount = saleTokenAmount - vestingCurrentAmount;

        tier.tierInfo.totalSold += saleTokenAmount;

        (, uint256 previousSpentAmount) = purchaseInfo.spentAmounts.tryGet(tokenToBuyWith);
        purchaseInfo.spentAmounts.set(tokenToBuyWith, previousSpentAmount + amount);
        purchaseInfo.claimTotalAmount += claimCurrentAmount;

        userInfo.vestingUserInfo.vestingTotalAmount += vestingCurrentAmount;

        _purchaseWithCommission(tokenToBuyWith, amount);
    }

    function _purchaseWithCommission(address token, uint256 amount) internal {
        TokenSaleProposal tokenSaleProposal = TokenSaleProposal(address(this));
        address govAddress = tokenSaleProposal.govAddress();
        address dexeGovAddress = tokenSaleProposal.dexeGovAddress();

        if (govAddress != dexeGovAddress) {
            CoreProperties coreProperties = CoreProperties(tokenSaleProposal.coreProperties());

            uint256 commission = amount.percentage(
                coreProperties.getTokenSaleProposalCommissionPercentage()
            );

            _sendFunds(token, dexeGovAddress, commission);

            amount -= commission;
        }

        _sendFunds(token, govAddress, amount);
    }

    function _sendFunds(address token, address to, uint256 amount) internal {
        if (token == ETHEREUM_ADDRESS) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "TSP: failed to transfer ether");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, to, amount.from18(token.decimals()));
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
        require(canParticipate(tier, tierId, user), "TSP: cannot participate");
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

        if (participationType == ITokenSaleProposal.ParticipationType.NoWhitelist) {
            _canParticipate = true;
        } else if (participationType == ITokenSaleProposal.ParticipationType.DAOVotes) {
            (, address govUserKeeper, , , ) = IGovPool(tokenSaleProposal.govAddress())
                .getHelperContracts();
            _canParticipate =
                IGovUserKeeper(govUserKeeper)
                .votingPower(
                    _asSingletonArray(user),
                    _asSingletonArray(IGovPool.VoteType.DelegatedVote)
                )[0].power >
                tier.decodeDAOVotes();
        } else if (participationType == ITokenSaleProposal.ParticipationType.Whitelist) {
            _canParticipate = tokenSaleProposal.balanceOf(user, tierId) > 0;
        } else if (participationType == ITokenSaleProposal.ParticipationType.BABT) {
            _canParticipate = tokenSaleProposal.babt().balanceOf(user) > 0;
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

    function _asSingletonArray(
        IGovPool.VoteType element
    ) private pure returns (IGovPool.VoteType[] memory arr) {
        arr = new IGovPool.VoteType[](1);
        arr[0] = element;
    }

    function _asSingletonArray(address element) private pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = element;
    }
}
