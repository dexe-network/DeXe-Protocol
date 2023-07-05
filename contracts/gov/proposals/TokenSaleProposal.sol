// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";
import "../../interfaces/core/ISBT721.sol";

import "../../libs/token-sale-proposal/TokenSaleProposalDecode.sol";
import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract TokenSaleProposal is ITokenSaleProposal, ERC1155SupplyUpgradeable, Multicall {
    using MathHelper for uint256;
    using TokenBalance for *;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using TokenSaleProposalDecode for Tier;

    address public govAddress;
    ISBT721 public babt;

    uint256 public override latestTierId;

    mapping(uint256 => Tier) internal _tiers;

    event TierCreated(uint256 tierId, address saleToken);
    event Bought(uint256 tierId, address buyer);
    event Whitelisted(uint256 tierId, address user);

    modifier onlyGov() {
        _onlyGov();
        _;
    }

    modifier ifTierExists(uint256 tierId) {
        require(
            _tiers[tierId].tierInitParams.saleTokenAddress != address(0),
            "TSP: tier does not exist"
        );
        _;
    }

    modifier ifTierIsNotOff(uint256 tierId) {
        require(!_tiers[tierId].tierInfo.isOff, "TSP: tier is off");
        _;
    }

    function __TokenSaleProposal_init(address _govAddress, ISBT721 _babt) external initializer {
        require(_govAddress != address(0), "TSP: zero gov address");

        govAddress = _govAddress;
        babt = _babt;
    }

    function createTiers(TierInitParams[] calldata tiers) external override onlyGov {
        for (uint256 i = 0; i < tiers.length; i++) {
            _createTier(tiers[i]);
        }
    }

    function addToWhitelist(WhitelistingRequest[] calldata requests) external override onlyGov {
        for (uint256 i = 0; i < requests.length; i++) {
            _addToWhitelist(requests[i]);
        }
    }

    function offTiers(uint256[] calldata tierIds) external override onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _offTier(tierIds[i]);
        }
    }

    function recover(uint256[] calldata tierIds) external onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            uint256 recoveringAmount = _getRecoverAmount(tierIds[i]);
            require(recoveringAmount > 0, "TSP: zero recovery");

            Tier storage tier = _tiers[tierIds[i]];

            tier.tierInfo.totalSold += recoveringAmount;

            IERC20(tier.tierInitParams.saleTokenAddress).sendFunds(msg.sender, recoveringAmount);
        }
    }

    function claim(uint256[] calldata tierIds) external override {
        for (uint256 i = 0; i < tierIds.length; i++) {
            uint256 claimAmount = _getClaimAmount(msg.sender, tierIds[i]);
            require(claimAmount > 0, "TSP: zero withdrawal");

            Tier storage tier = _tiers[tierIds[i]];

            tier.users[msg.sender].purchaseInfo.isClaimed = true;

            IERC20(tier.tierInitParams.saleTokenAddress).sendFunds(msg.sender, claimAmount);
        }
    }

    function vestingWithdraw(uint256[] calldata tierIds) external override {
        for (uint256 i = 0; i < tierIds.length; i++) {
            uint256 vestingWithdrawAmount = _getVestingWithdrawAmount(msg.sender, tierIds[i]);
            require(vestingWithdrawAmount > 0, "TSP: zero withdrawal");

            Tier storage tier = _tiers[tierIds[i]];

            VestingUserInfo storage vestingUserInfo = tier.users[msg.sender].vestingUserInfo;

            vestingUserInfo.latestVestingWithdraw = uint64(block.timestamp);
            vestingUserInfo.vestingWithdrawnAmount += vestingWithdrawAmount;

            IERC20(tier.tierInitParams.saleTokenAddress).sendFunds(
                msg.sender,
                vestingWithdrawAmount
            );
        }
    }

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable {
        bool isNativeCurrency = tokenToBuyWith == ETHEREUM_ADDRESS;
        uint256 saleTokenAmount = getSaleTokenAmount(
            msg.sender,
            tierId,
            tokenToBuyWith,
            isNativeCurrency ? msg.value : amount
        );

        Tier storage tier = _tiers[tierId];
        TierInfo storage tierInfo = tier.tierInfo;

        TierInitParams memory tierInitParams = tier.tierInitParams;

        uint256 vestingCurrentAmount = saleTokenAmount.percentage(
            tierInitParams.vestingSettings.vestingPercentage
        );
        uint256 claimCurrentAmount = saleTokenAmount - vestingCurrentAmount;

        tier.tierInfo.totalSold += saleTokenAmount;

        UserInfo storage userInfo = tier.users[msg.sender];

        PurchaseInfo storage purchaseInfo = userInfo.purchaseInfo;
        uint256 newSpentAmount = purchaseInfo.spentAmounts.get(tokenToBuyWith) + amount;
        purchaseInfo.spentAmounts.set(tokenToBuyWith, newSpentAmount);
        purchaseInfo.claimTotalAmount += claimCurrentAmount;

        userInfo.vestingUserInfo.vestingTotalAmount += vestingCurrentAmount;

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

        emit Bought(tierId, msg.sender);
    }

    function lockParticipationTokens(
        uint256 tierId
    ) external payable override ifTierExists(tierId) {
        Tier storage tier = _tiers[tierId];
        PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        (address token, uint256 amount) = tier.decodeTokenLock();

        require(purchaseInfo.lockedAmount == 0, "TSP: already locked");

        purchaseInfo.lockedAmount = amount;

        if (token != ETHEREUM_ADDRESS) {
            IERC20(token).safeTransferFrom(
                msg.sender,
                address(this),
                amount.from18(ERC20(token).decimals())
            );
        } else {
            require(msg.value == amount, "TSP: wrong lock amount");
        }
    }

    function lockParticipationNft(
        uint256 tierId,
        uint256 tokenId
    ) external override ifTierExists(tierId) {
        Tier storage tier = _tiers[tierId];
        PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        address token = tier.decodeNftLock();

        require(purchaseInfo.lockedId == 0, "TSP: already locked");

        purchaseInfo.lockedId = tokenId;

        IERC721(token).safeTransferFrom(msg.sender, address(this), tokenId);
    }

    function unlockParticipationTokens(uint256 tierId) external override ifTierExists(tierId) {
        Tier storage tier = _tiers[tierId];
        PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        (address token, uint256 amount) = tier.decodeTokenLock();

        require(block.timestamp >= tier.tierInitParams.saleEndTime, "TSP: sale is not over");
        require(purchaseInfo.lockedAmount == amount, "TSP: not locked");

        purchaseInfo.lockedAmount = 0;

        token.sendFunds(msg.sender, amount);
    }

    function unlockParticipationNft(uint256 tierId) external override ifTierExists(tierId) {
        Tier storage tier = _tiers[tierId];
        PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        address token = tier.decodeNftLock();
        uint256 tokenId = purchaseInfo.lockedId;

        require(block.timestamp >= tier.tierInitParams.saleEndTime, "TSP: sale is not over");
        require(tokenId != 0, "TSP: not locked");

        purchaseInfo.lockedId = 0;

        IERC721(token).safeTransferFrom(address(this), msg.sender, tokenId);
    }

    function getSaleTokenAmount(
        address user,
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) public view ifTierExists(tierId) ifTierIsNotOff(tierId) returns (uint256) {
        require(amount > 0, "TSP: zero amount");
        require(_canParticipate(user, tierId), "TSP: not whitelisted");

        Tier storage tier = _tiers[tierId];

        TierInitParams memory tierInitParams = tier.tierInitParams;

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

    function getClaimAmounts(
        address user,
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory claimAmounts) {
        claimAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < tierIds.length; i++) {
            claimAmounts[i] = _getClaimAmount(user, tierIds[i]);
        }
    }

    function getVestingWithdrawAmounts(
        address user,
        uint256[] calldata tierIds
    ) public view returns (uint256[] memory vestingWithdrawAmounts) {
        vestingWithdrawAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < tierIds.length; i++) {
            vestingWithdrawAmounts[i] = _getVestingWithdrawAmount(user, tierIds[i]);
        }
    }

    function getRecoverAmounts(
        uint256[] calldata tierIds
    ) public view returns (uint256[] memory recoveringAmounts) {
        recoveringAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < recoveringAmounts.length; i++) {
            recoveringAmounts[i] = _getRecoverAmount(tierIds[i]);
        }
    }

    function getTierViews(
        uint256 offset,
        uint256 limit
    ) external view returns (TierView[] memory tierViews) {
        uint256 to = (offset + limit).min(latestTierId).max(offset);

        tierViews = new TierView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            Tier storage tier = _tiers[i + 1];

            tierViews[i - offset] = TierView({
                tierInitParams: tier.tierInitParams,
                tierInfo: tier.tierInfo
            });
        }
    }

    function getUserViews(
        address user,
        uint256[] calldata tierIds
    ) external view returns (UserView[] memory userViews) {
        userViews = new UserView[](tierIds.length);

        for (uint256 i = 0; i < userViews.length; i++) {
            userViews[i] = _getUserView(user, tierIds[i]);
        }
    }

    function uri(uint256 tierId) public view override returns (string memory) {
        return _tiers[tierId].tierInfo.uri;
    }

    function _createTier(TierInitParams memory tierInitParams) internal {
        require(tierInitParams.saleTokenAddress != address(0), "TSP: sale token cannot be zero");
        require(
            tierInitParams.saleTokenAddress != ETHEREUM_ADDRESS,
            "TSP: cannot sale native currency"
        );
        require(tierInitParams.totalTokenProvided != 0, "TSP: sale token is not provided");
        require(
            tierInitParams.saleStartTime <= tierInitParams.saleEndTime,
            "TSP: saleEndTime is less than saleStartTime"
        );
        require(
            tierInitParams.minAllocationPerUser <= tierInitParams.maxAllocationPerUser,
            "TSP: wrong allocation"
        );
        require(
            _validateVestingSettings(tierInitParams.vestingSettings),
            "TSP: vesting settings validation failed"
        );
        require(
            _validateParticipationDetails(tierInitParams.participationDetails),
            "TSP: participation details validation failed"
        );
        require(
            tierInitParams.purchaseTokenAddresses.length != 0,
            "TSP: purchase tokens are not provided"
        );
        require(
            tierInitParams.purchaseTokenAddresses.length == tierInitParams.exchangeRates.length,
            "TSP: tokens and rates lengths mismatch"
        );

        uint256 saleTokenDecimals = ERC20(tierInitParams.saleTokenAddress).decimals();

        tierInitParams.minAllocationPerUser = tierInitParams.minAllocationPerUser.to18(
            saleTokenDecimals
        );
        tierInitParams.maxAllocationPerUser = tierInitParams.maxAllocationPerUser.to18(
            saleTokenDecimals
        );
        tierInitParams.totalTokenProvided = tierInitParams.totalTokenProvided.to18(
            saleTokenDecimals
        );

        if (tierInitParams.participationDetails.participationType == ParticipationType.TokenLock) {
            (address token, uint256 amount) = abi.decode(
                tierInitParams.participationDetails.data,
                (address, uint256)
            );
            tierInitParams.participationDetails.data = abi.encode(
                token,
                amount.to18(ERC20(token).decimals())
            );
        }

        Tier storage tier = _tiers[++latestTierId];

        for (uint256 i = 0; i < tierInitParams.purchaseTokenAddresses.length; i++) {
            require(tierInitParams.exchangeRates[i] != 0, "TSP: rate cannot be zero");
            require(
                tierInitParams.purchaseTokenAddresses[i] != address(0),
                "TSP: purchase token cannot be zero"
            );
            require(
                tier.rates[tierInitParams.purchaseTokenAddresses[i]] == 0,
                "TSP: purchase tokens are duplicated"
            );

            tier.rates[tierInitParams.purchaseTokenAddresses[i]] = tierInitParams.exchangeRates[i];
        }

        uint64 vestingStartTime = tierInitParams.saleEndTime +
            tierInitParams.vestingSettings.cliffPeriod;
        tier.tierInitParams = tierInitParams;
        tier.tierInfo.vestingTierInfo = VestingTierInfo({
            vestingStartTime: vestingStartTime,
            vestingEndTime: vestingStartTime + tierInitParams.vestingSettings.vestingDuration
        });

        emit TierCreated(latestTierId, tierInitParams.saleTokenAddress);
    }

    function _addToWhitelist(
        WhitelistingRequest calldata request
    ) internal ifTierExists(request.tierId) ifTierIsNotOff(request.tierId) {
        Tier storage tier = _tiers[request.tierId];

        require(
            tier.tierInitParams.participationDetails.participationType ==
                ParticipationType.Whitelist,
            "TSP: wrong participation type"
        );

        tier.tierInfo.uri = request.uri;

        for (uint256 i = 0; i < request.users.length; i++) {
            _mint(request.users[i], request.tierId, 1, "");

            emit Whitelisted(request.tierId, request.users[i]);
        }
    }

    function _offTier(uint256 tierId) internal ifTierExists(tierId) ifTierIsNotOff(tierId) {
        _tiers[tierId].tierInfo.isOff = true;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        require(from == address(0), "TSP: only for minting");

        for (uint256 i = 0; i < ids.length; i++) {
            require(balanceOf(to, ids[i]) == 0, "TSP: balance can be only 0 or 1");
        }
    }

    function _getClaimAmount(
        address user,
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (uint256) {
        Tier storage tier = _tiers[tierId];

        TierInitParams memory tierInitParams = tier.tierInitParams;

        require(
            block.timestamp >= tierInitParams.saleEndTime + tierInitParams.claimLockDuration,
            "TSP: claim is locked"
        );

        PurchaseInfo storage purchaseInfo = tier.users[user].purchaseInfo;

        return purchaseInfo.isClaimed ? 0 : purchaseInfo.claimTotalAmount;
    }

    function _getVestingWithdrawAmount(
        address user,
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (uint256) {
        Tier storage tier = _tiers[tierId];

        VestingUserInfo memory vestingUserInfo = tier.users[user].vestingUserInfo;

        return
            _countPrefixVestingAmount(
                block.timestamp,
                vestingUserInfo.vestingTotalAmount,
                tier.tierInfo.vestingTierInfo,
                tier.tierInitParams.vestingSettings
            ) - vestingUserInfo.vestingWithdrawnAmount;
    }

    function _getRecoverAmount(
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (uint256) {
        Tier storage tier = _tiers[tierId];

        TierInitParams memory tierInitParams = tier.tierInitParams;
        TierInfo memory tierInfo = tier.tierInfo;

        if (!tierInfo.isOff && block.timestamp <= tierInitParams.saleEndTime) {
            return 0;
        }

        return tierInitParams.totalTokenProvided - tierInfo.totalSold;
    }

    function _getUserView(
        address user,
        uint256 tierId
    ) internal view ifTierExists(tierId) returns (UserView memory userView) {
        Tier storage tier = _tiers[tierId];
        UserInfo storage userInfo = tier.users[user];
        PurchaseInfo storage purchaseInfo = userInfo.purchaseInfo;

        TierInitParams memory tierInitParams = tier.tierInitParams;
        VestingUserInfo memory vestingUserInfo = userInfo.vestingUserInfo;
        VestingTierInfo memory vestingTierInfo = tier.tierInfo.vestingTierInfo;
        VestingSettings memory vestingSettings = tierInitParams.vestingSettings;

        userView.canParticipate = _canParticipate(user, tierId);

        PurchaseView memory purchaseView;
        purchaseView.isClaimed = purchaseInfo.isClaimed;
        purchaseView.claimUnlockTime =
            tierInitParams.saleEndTime +
            tierInitParams.claimLockDuration;
        purchaseView.canClaim = purchaseView.claimUnlockTime <= block.timestamp;
        purchaseView.claimTotalAmount = purchaseInfo.claimTotalAmount;
        purchaseView.boughtTotalAmount =
            purchaseView.claimTotalAmount +
            vestingUserInfo.vestingTotalAmount;
        purchaseView.lockedAmount = purchaseInfo.lockedAmount;
        purchaseView.lockedId = purchaseInfo.lockedId;

        uint256 purchaseTokenLength = purchaseInfo.spentAmounts.length();

        purchaseView.purchaseTokenAddresses = new address[](purchaseTokenLength);
        purchaseView.purchaseTokenAmounts = new uint256[](purchaseTokenLength);

        for (uint256 i = 0; i < purchaseTokenLength; i++) {
            (address purchaseTokenAddress, uint256 purchaseTokenAmount) = purchaseInfo
                .spentAmounts
                .at(i);

            purchaseView.purchaseTokenAddresses[i] = purchaseTokenAddress;
            purchaseView.purchaseTokenAmounts[i] = purchaseTokenAmount;
        }

        userView.purchaseView = purchaseView;

        if (vestingUserInfo.vestingTotalAmount == 0) {
            return userView;
        }

        VestingUserView memory vestingUserView;
        vestingUserView.latestVestingWithdraw = vestingUserInfo.latestVestingWithdraw;
        vestingUserView.vestingTotalAmount = vestingUserInfo.vestingTotalAmount;
        vestingUserView.vestingWithdrawnAmount = vestingUserInfo.vestingWithdrawnAmount;

        if (block.timestamp < vestingTierInfo.vestingStartTime) {
            vestingUserView.nextUnlockTime =
                vestingTierInfo.vestingStartTime +
                vestingSettings.unlockStep;
        } else if (block.timestamp < vestingTierInfo.vestingEndTime) {
            vestingUserView.nextUnlockTime = uint64(block.timestamp) + vestingSettings.unlockStep;
            vestingUserView.nextUnlockTime -=
                (vestingUserView.nextUnlockTime - vestingTierInfo.vestingStartTime) %
                vestingSettings.unlockStep;
            vestingUserView.nextUnlockTime = uint64(
                uint256(vestingUserView.nextUnlockTime).min(vestingTierInfo.vestingEndTime)
            );
        }

        uint256 currentPrefixVestingAmount = _countPrefixVestingAmount(
            block.timestamp,
            vestingUserView.vestingTotalAmount,
            vestingTierInfo,
            vestingSettings
        );

        if (vestingUserView.nextUnlockTime != 0) {
            vestingUserView.nextUnlockAmount =
                _countPrefixVestingAmount(
                    vestingUserView.nextUnlockTime,
                    vestingUserView.vestingTotalAmount,
                    vestingTierInfo,
                    vestingSettings
                ) -
                currentPrefixVestingAmount;
        }

        vestingUserView.amountToWithdraw =
            currentPrefixVestingAmount -
            vestingUserView.vestingWithdrawnAmount;
        vestingUserView.lockedAmount =
            vestingUserView.vestingTotalAmount -
            currentPrefixVestingAmount;

        userView.vestingUserView = vestingUserView;
    }

    function _canParticipate(
        address user,
        uint256 tierId
    ) internal view returns (bool canParticipate) {
        Tier storage tier = _tiers[tierId];
        ParticipationType participationType = tier
            .tierInitParams
            .participationDetails
            .participationType;

        if (participationType == ParticipationType.DAOVotes) {
            (, address govUserKeeper, , ) = IGovPool(govAddress).getHelperContracts();
            canParticipate =
                IGovUserKeeper(govUserKeeper)
                .votingPower(
                    _asSingletonArray(msg.sender),
                    _asSingletonArray(false),
                    _asSingletonArray(true)
                )[0].power >
                tier.decodeDAOVotes();
        } else if (participationType == ParticipationType.Whitelist) {
            canParticipate = balanceOf(msg.sender, tierId) > 0;
        } else if (participationType == ParticipationType.BABT) {
            canParticipate = babt.balanceOf(msg.sender) > 0;
        } else {
            PurchaseInfo storage purchaseInfo = tier.users[user].purchaseInfo;

            if (participationType == ParticipationType.TokenLock) {
                canParticipate = purchaseInfo.lockedAmount > 0;
            } else {
                canParticipate = purchaseInfo.lockedId != 0;
            }
        }
    }

    function _onlyGov() internal view {
        require(govAddress == address(0) || msg.sender == govAddress, "TSP: not a Gov contract");
    }

    function _countPrefixVestingAmount(
        uint256 timestamp,
        uint256 vestingTotalAmount,
        VestingTierInfo memory vestingTierInfo,
        VestingSettings memory vestingSettings
    ) private pure returns (uint256) {
        if (timestamp < vestingTierInfo.vestingStartTime) {
            return 0;
        }

        if (timestamp >= vestingTierInfo.vestingEndTime) {
            return vestingTotalAmount;
        }

        uint256 beforeLastSegmentAmount = vestingTotalAmount.ratio(
            vestingSettings.vestingDuration -
                (vestingSettings.vestingDuration % vestingSettings.unlockStep),
            vestingSettings.vestingDuration
        );
        uint256 segmentsTotal = vestingSettings.vestingDuration / vestingSettings.unlockStep;
        uint256 segmentsBefore = (timestamp - vestingTierInfo.vestingStartTime) /
            vestingSettings.unlockStep;

        return beforeLastSegmentAmount.ratio(segmentsBefore, segmentsTotal);
    }

    function _validateVestingSettings(
        VestingSettings memory vestingSettings
    ) private pure returns (bool) {
        if (
            vestingSettings.vestingPercentage == 0 &&
            vestingSettings.vestingDuration == 0 &&
            vestingSettings.unlockStep == 0 &&
            vestingSettings.cliffPeriod == 0
        ) {
            return true;
        }

        return
            vestingSettings.vestingDuration != 0 &&
            vestingSettings.vestingPercentage != 0 &&
            vestingSettings.unlockStep != 0 &&
            vestingSettings.vestingPercentage <= PERCENTAGE_100 &&
            vestingSettings.vestingDuration >= vestingSettings.unlockStep;
    }

    function _validateParticipationDetails(
        ParticipationDetails memory participationDetails
    ) private pure returns (bool) {
        if (participationDetails.participationType == ParticipationType.DAOVotes) {
            return participationDetails.data.length == 32;
        } else if (participationDetails.participationType == ParticipationType.Whitelist) {
            return participationDetails.data.length == 0;
        } else if (participationDetails.participationType == ParticipationType.BABT) {
            return participationDetails.data.length == 0;
        } else if (participationDetails.participationType == ParticipationType.TokenLock) {
            return participationDetails.data.length == 64;
        } else {
            return participationDetails.data.length == 32;
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
