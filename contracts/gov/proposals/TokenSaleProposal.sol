// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";
import "../../interfaces/core/ISBT721.sol";

import "../../libs/token-sale-proposal/TokenSaleProposalDecode.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalBuy.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalVesting.sol";

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
    using TokenSaleProposalVesting for Tier;
    using TokenSaleProposalBuy for Tier;

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
            _getTier(tierIds[i]).vestingWithdraw();
        }
    }

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable {
        _getTier(tierId).buy(tierId, tokenToBuyWith, amount);

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
    ) public view ifTierIsNotOff(tierId) returns (uint256) {
        return _getTier(tierId).getSaleTokenAmount(user, tierId, tokenToBuyWith, amount);
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
            vestingWithdrawAmounts[i] = _getTier(tierIds[i]).getVestingWithdrawAmount(user);
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
            Tier storage tier = _getTier(tierIds[i]);

            userViews[i] = UserView({
                canParticipate: tier.canParticipate(tierIds[i], user),
                purchaseView: tier.getPurchaseView(user),
                vestingUserView: tier.getVestingUserView(user)
            });
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

    function _onlyGov() internal view {
        require(govAddress == address(0) || msg.sender == govAddress, "TSP: not a Gov contract");
    }

    function _getTier(
        uint256 tierId
    ) private view ifTierExists(tierId) returns (Tier storage tier) {
        return _tiers[tierId];
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
}
