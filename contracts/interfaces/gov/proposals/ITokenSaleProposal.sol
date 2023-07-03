// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

/**
 * The contract for the additional proposal with custom settings.
 * This contract acts as a marketplace to provide DAO pools with the ability to sell their own ERC20 tokens.
 */
interface ITokenSaleProposal {
    /// @notice Metadata of the tier that is part of the initial tier parameters
    /// @param name the name of the tier
    /// @param description the description of the tier
    struct TierMetadata {
        string name;
        string description;
    }

    /// @notice Vesting parameters that are part of the initial tier parameters
    /// @param vestingPercentage percentage of the purchased token amount that goes to vesting
    /// @param vestingDuration how long vesting lasts from the time of the token purchase
    /// @param cliffPeriod how long the user cannot make a vesting withdrawal from the time of the token purchase
    /// @param unlockStep the tick step with which funds from the vesting are given to the buyer
    struct VestingSettings {
        uint256 vestingPercentage;
        uint64 vestingDuration;
        uint64 cliffPeriod;
        uint64 unlockStep;
    }

    /// @notice Initial tier parameters
    /// @param metadata metadata of the tier (see TierMetadata)
    /// @param totalTokenProvided total supply of tokens provided for the tier
    /// @param saleStartTime start time of token sales
    /// @param saleEndTime end time of token sales
    /// @param claimLockDuration the period of time between the end of the token sale and the non-vesting tokens claiming
    /// @param saleTokenAddress address of the token being sold
    /// @param purchaseTokenAddresses tokens, that can be used for purchasing token of the proposal
    /// @param exchangeRates exchange rates of other tokens to the token of TokenSaleProposal
    /// @param minAllocationPerUser minimal allocation of tokens per one user
    /// @param maxAllocationPerUser maximal allocation of tokens per one user
    /// @param vestingSettings settings for managing tokens vesting (unlocking). While tokens are locked investors won`t be able to withdraw them
    struct TierInitParams {
        TierMetadata metadata;
        uint256 totalTokenProvided;
        uint64 saleStartTime;
        uint64 saleEndTime;
        uint64 claimLockDuration;
        address saleTokenAddress;
        address[] purchaseTokenAddresses;
        uint256[] exchangeRates;
        uint256 minAllocationPerUser;
        uint256 maxAllocationPerUser;
        VestingSettings vestingSettings;
    }

    /// @notice Vesting tier-related parameters. This struct is used in view functions of contract as a return argument
    /// @param vestingStartTime the start time of the vesting when the cliff period ends
    /// @param vestingEndTime the end time of the vesting
    struct VestingTierInfo {
        uint64 vestingStartTime;
        uint64 vestingEndTime;
    }

    /// @notice Dynamic tier parameters
    /// @param isOff whether the tier is off
    /// @param whitelisted true if the tier has at least one user in its whitelist, false otherwise
    /// @param totalSold how many tokens were sold
    /// @param uri whitelist uri
    /// @param vestingTierInfo vesting tier-related params
    struct TierInfo {
        bool isOff;
        bool whitelisted;
        uint256 totalSold;
        string uri;
        VestingTierInfo vestingTierInfo;
    }

    /// @notice Purchase parameters
    /// @param spentAmounts matching purchase token addresses with spent amounts
    /// @param claimTotalAmount the total amount to be claimed
    /// @param isClaimed the boolean indicating whether the purchase has been claimed or not
    struct PurchaseInfo {
        EnumerableMap.AddressToUintMap spentAmounts;
        uint256 claimTotalAmount;
        bool isClaimed;
    }

    /// @notice Purchase parameters. This struct is used in view functions as part of a return argument
    /// @param isClaimed the boolean indicating whether non-vesting tokens have been claimed or not
    /// @param canClaim the boolean indication whether the user can claim non-vesting tokens
    /// @param claimUnlockTime the time the user can claim its non-vesting tokens
    /// @param claimTotalAmount the total amount of tokens to be claimed
    /// @param boughtTotalAmount the total amount of tokens user bought including vesting and non-vesting tokens
    /// @param purchaseTokenAddresses the list of purchase token addresses
    /// @param purchaseTokenAmounts the list of purchase token amounts
    struct PurchaseView {
        bool isClaimed;
        bool canClaim;
        uint64 claimUnlockTime;
        uint256 claimTotalAmount;
        uint256 boughtTotalAmount;
        address[] purchaseTokenAddresses;
        uint256[] purchaseTokenAmounts;
    }

    /// @notice Vesting user-related parameters
    /// @param latestVestingWithdraw the latest timestamp of the vesting withdrawal
    /// @param vestingTotalAmount the total amount of user vesting tokens
    /// @param vestingWithdrawnAmount the total amount of tokens user has withdrawn from vesting
    struct VestingUserInfo {
        uint64 latestVestingWithdraw;
        uint256 vestingTotalAmount;
        uint256 vestingWithdrawnAmount;
    }

    /// @notice Vesting user-related parameters. This struct is used in view functions as part of a return argument
    /// @param latestVestingWithdraw the latest timestamp of the vesting withdrawal
    /// @param nextUnlockTime the next time the user will receive vesting funds. It is zero if there are no more locked tokens
    /// @param nextUnlockAmount the token amount which will be unlocked in the next unlock time
    /// @param vestingTotalAmount the total amount of user vesting tokens
    /// @param vestingWithdrawnAmount the total amount of tokens user has withdrawn from vesting
    /// @param amountToWithdraw the vesting token amount which can be withdrawn in the current time
    /// @param lockedAmount the vesting token amount which is locked in the current time
    struct VestingUserView {
        uint64 latestVestingWithdraw;
        uint64 nextUnlockTime;
        uint256 nextUnlockAmount;
        uint256 vestingTotalAmount;
        uint256 vestingWithdrawnAmount;
        uint256 amountToWithdraw;
        uint256 lockedAmount;
    }

    /// @notice User parameters
    /// @param purchaseInfo the information about the user purchase
    /// @param vestingUserInfo the information about the user vesting
    struct UserInfo {
        PurchaseInfo purchaseInfo;
        VestingUserInfo vestingUserInfo;
    }

    /// @notice User parameters. This struct is used in view functions as a return argument
    /// @param canParticipate the boolean indicating whether the user is whitelisted in the corresponding tier
    /// @param purchaseInfo the information about the user purchase
    /// @param vestingUserInfo the information about the user vesting
    struct UserView {
        bool canParticipate;
        PurchaseView purchaseView;
        VestingUserView vestingUserView;
    }

    /// @notice Tier parameters
    /// @param tierInitParams the initial tier parameters
    /// @param tierInfo the information about the tier
    /// @param rates the mapping of token addresses to their exchange rates
    /// @param users the mapping of user addresses to their infos
    struct Tier {
        TierInitParams tierInitParams;
        TierInfo tierInfo;
        mapping(address => uint256) rates;
        mapping(address => UserInfo) users;
    }

    /// @notice Tier parameters. This struct is used in view functions as a return argument
    /// @param tierInitParams the initial tier parameters
    /// @param tierInfo the information about the tier
    struct TierView {
        TierInitParams tierInitParams;
        TierInfo tierInfo;
    }

    /// @notice Whitelisting request parameters. This struct is used as an input parameter to the whitelist update function
    /// @param tierId the id of the tier
    /// @param users the list of the users to be whitelisted
    /// @param uri tokens metadata uri
    struct WhitelistingRequest {
        uint256 tierId;
        address[] users;
        string uri;
    }

    /// @notice This function is used to get id (index) of the latest tier of the token sale
    /// @return the id of the latest tier
    function latestTierId() external view returns (uint256);

    /// @notice This function is used for tiers creation
    /// @param tiers parameters of tiers
    function createTiers(TierInitParams[] calldata tiers) external;

    /// @notice This function is used to add users to the whitelist of tier
    /// @param requests requests for adding users to the whitelist
    function addToWhitelist(WhitelistingRequest[] calldata requests) external;

    /// @notice This function is used to set given tiers inactive
    /// @param tierIds tier ids to set inactive
    function offTiers(uint256[] calldata tierIds) external;

    /// @notice This function is used to return to the DAO treasury tokens that have not been purchased during sale
    /// @param tierIds tier ids to recover from
    function recover(uint256[] calldata tierIds) external;

    /// @notice This function is used to withdraw non-vesting tokens from given tiers
    /// @param tierIds tier ids to make withdrawals from
    function claim(uint256[] calldata tierIds) external;

    /// @notice This function is used to withdraw vesting tokens from given tiers
    /// @param tierIds tier ids to make withdrawals from
    function vestingWithdraw(uint256[] calldata tierIds) external;

    /// @notice This function is used to purchase tokens in the given tier
    /// @param tierId the id of the tier where tokens will be purchased
    /// @param tokenToBuyWith the token that will be used (exchanged) to purchase token on the token sale
    /// @param amount the amount of the token to be used for this exchange
    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;

    /// @notice This function is used to get amount of `TokenSaleProposal` tokens that can be purchased
    /// @param user the address of the user that purchases tokens
    /// @param tierId the id of the tier in which tokens are purchased
    /// @param tokenToBuyWith the token which is used for exchange
    /// @param amount the token amount used for exchange
    /// @return expected sale token amount
    function getSaleTokenAmount(
        address user,
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) external view returns (uint256);

    /// @notice This function is used to get information about the amount of non-vesting tokens that user can withdraw (that are unlocked) from given tiers
    /// @param user the address of the user
    /// @param tierIds the array of tier ids
    /// @return claimAmounts the array of token amounts that can be withdrawn from each tier
    function getClaimAmounts(
        address user,
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory claimAmounts);

    /// @notice This function is used to get information about the amount of vesting tokens that user can withdraw (that are unlocked) from given tiers
    /// @param user the address of the user
    /// @param tierIds the array of tier ids
    /// @return vestingWithdrawAmounts the array of token amounts that can be withdrawn from each tier
    function getVestingWithdrawAmounts(
        address user,
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory vestingWithdrawAmounts);

    /// @notice This function is used to get amount of tokens that have not been purchased during sale in given tiers and can be returned to DAO treasury
    /// @param tierIds the array of tier ids
    /// @return recoveringAmounts the array of token amounts that can be returned to DAO treasury in each tier
    function getRecoverAmounts(
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory recoveringAmounts);

    /// @notice This function is used to get a list of tiers
    /// @param offset the offset of the list
    /// @param limit the limit for amount of elements in the list
    /// @return tierViews the list of tier views
    function getTierViews(
        uint256 offset,
        uint256 limit
    ) external view returns (TierView[] memory tierViews);

    /// @notice This function is used to get user's infos from tiers
    /// @param user the address of the user whose infos are required
    /// @param tierIds the list of tier ids to get infos from
    /// @return userViews the list of user views
    function getUserViews(
        address user,
        uint256[] calldata tierIds
    ) external view returns (UserView[] memory userViews);
}
