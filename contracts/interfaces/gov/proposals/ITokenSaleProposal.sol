// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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
        uint256 vestingDuration;
        uint256 cliffPeriod;
        uint256 unlockStep;
    }

    /// @notice Initial tier parameters. This struct is used to create a new tier and as a return argument in contract view functions
    /// @param metadata metadata of the tier (see TierMetadata)
    /// @param totalTokenProvided total supply of tokens provided for the tier
    /// @param saleStartTime start time of token sales
    /// @param saleEndTime end time of token sales
    /// @param saleTokenAddress address of the token being sold
    /// @param purchaseTokenAddresses tokens, that can be used for purchasing token of the proposal
    /// @param exchangeRates exchange rates of other tokens to the token of TokenSaleProposal
    /// @param minAllocationPerUser minimal allocation of tokens per one user
    /// @param maxAllocationPerUser maximal allocation of tokens per one user
    /// @param vestingSettings settings for managing tokens vesting (unlocking). While tokens are locked investors won`t be able to withdraw them
    struct TierView {
        TierMetadata metadata;
        uint256 totalTokenProvided;
        uint256 saleStartTime;
        uint256 saleEndTime;
        address saleTokenAddress;
        address[] purchaseTokenAddresses;
        uint256[] exchangeRates;
        uint256 minAllocationPerUser;
        uint256 maxAllocationPerUser;
        VestingSettings vestingSettings;
    }

    /// @notice Dynamic tier parameters. This struct is used in view functions of contract as a return argument
    /// @param isOff whether the tier is off
    /// @param totalSold how many tokens were sold
    /// @param uri whitelist uri
    struct TierInfoView {
        bool isOff;
        uint256 totalSold;
        string uri;
    }

    /// @notice Purchase parameters. This struct is used in view functions of contract as a return argument
    /// @param purchaseTime the time of the purchase
    /// @param vestingTotalAmount the token amount allocated for vesting
    /// @param vestingWithdrawnAmount the token amount withdrawn by the user
    /// @param latestVestingWithdraw the last time the buyer made a vesting withdrawal
    struct Purchase {
        uint256 purchaseTime;
        uint256 vestingTotalAmount;
        uint256 vestingWithdrawnAmount;
        uint256 latestVestingWithdraw;
    }

    /// @notice Vesting dynamic parameters. This struct is used in view functions of contract as a return argument
    /// @param cliffEndTime the end time of the cliff period
    /// @param vestingEndTime the end time of the vesting
    /// @param nextUnlockTime the next time the user will receive vesting funds. It is zero if there are no more locked tokens
    /// @param nextUnlockAmount the token amount which will be unlocked in the next unlock time
    /// @param amountToWithdraw the token amount which can be withdrawn in the current time
    /// @param lockedAmount the token amount which is locked in the current time
    struct VestingView {
        uint256 cliffEndTime;
        uint256 vestingEndTime;
        uint256 nextUnlockTime;
        uint256 nextUnlockAmount;
        uint256 amountToWithdraw;
        uint256 lockedAmount;
    }

    /// @notice User parameters. This struct is used in view functions of contract as a return argument
    /// @param isWhitelisted true if the user is whitelisted in the corresponding tier, false otherwise
    /// @param purchase user purchase parameters in the corresponding tier
    /// @param vestingView user vesting parameters in the corresponding tier
    struct UserInfo {
        bool isWhitelisted;
        Purchase purchase;
        VestingView vestingView;
    }

    /// @notice Additional tier parameters (only for internal needs)
    /// @param tierInfoView dynamic tier parameters
    /// @param rates matching purchase token addresses with their exchange rates
    /// @param customers matching customers with their purchase parameters (each customer can make only one purchase)
    struct TierInfo {
        TierInfoView tierInfoView;
        mapping(address => uint256) rates;
        mapping(address => Purchase) customers;
    }

    /// @notice All tier parameters (only for internal needs)
    /// @param tierView initial tier parameters
    /// @param tierInfo dynamic tier parameters
    struct Tier {
        TierView tierView;
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
    function createTiers(TierView[] calldata tiers) external;

    /// @notice This function is used to add users to the whitelist of tier
    /// @param requests requests for adding users to the whitelist
    function addToWhitelist(WhitelistingRequest[] calldata requests) external;

    /// @notice This function is used to set given tiers inactive
    /// @param tierIds tier ids to set inactive
    function offTiers(uint256[] calldata tierIds) external;

    /// @notice This function is used to withdraw tokens from given tiers
    /// @param tierIds tier ids to make withdrawals from
    function vestingWithdraw(uint256[] calldata tierIds) external;

    /// @notice This function is used to purchase tokens in the given tier
    /// @param tierId the id of the tier where tokens will be purchased
    /// @param tokenToBuyWith the token that will be used (exchanged) to purchase token on the token sale
    /// @param amount the amount of the token to be used for this exchange
    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;

    /// @notice This function is used to return to the DAO treasury tokens that have not been purchased during sale
    /// @param tierIds tier ids to recover from
    function recover(uint256[] calldata tierIds) external;

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

    /// @notice This function is used to get information about the amount of tokens that user can withdraw (that are unlocked) from given tiers
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
    /// @return tierViews the list of initial tier parameters
    /// @return tierInfoViews the list of dynamic tier parameters
    function getTiers(
        uint256 offset,
        uint256 limit
    ) external view returns (TierView[] memory tierViews, TierInfoView[] memory tierInfoViews);

    /// @notice This function is used to get user's infos from tiers
    /// @param user the address of the user whose infos are required
    /// @param tierIds the list of tier ids to get infos from
    /// @return userInfos the list of user infos
    function getUserInfos(
        address user,
        uint256[] calldata tierIds
    ) external view returns (UserInfo[] memory userInfos);
}
