# 💲 Token Sale Proposal

**DAO** pools could issue their own **ERC20** token and sell it to investors with custom sale logic.

#

Function ***`createTiers()`*** is used for tiers creation.

```solidity
function createTiers(TierInitParams[] calldata tiers) external onlyGov;
```

- ***tiers*** - initial tier parameters

```solidity
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
    ParticipationDetails[] participationDetails;
}
```

- ***metadata*** - metadata of the tier (see `TierMetadata`)
- ***totalTokenProvided*** - total supply of tokens provided for the tier
- ***saleStartTime*** - start time of token sales
- ***saleEndTime*** - end time of token sales
- ***claimLockDuration*** - the period of time between the end of the token sale and the non-vesting tokens claiming
- ***saleTokenAddress*** - address of the token being sold
- ***purchaseTokenAddresses*** - tokens, that can be used for purchasing token of the proposal
- ***exchangeRates*** - exchange rates of other tokens to the token of `TokenSaleProposal`
- ***minAllocationPerUser*** - minimal allocation of tokens per one user
- ***maxAllocationPerUser*** - maximal allocation of tokens per one user
- ***vestingSettings*** - settings for managing tokens vesting (unlocking). While tokens are locked investors won`t be able to withdraw them.
- ***participationDetails*** - the list of participation requirement parameters

```solidity
struct TierMetadata {
    string name;
    string description;
}
```

- ***name*** - the name of the tier
- ***description*** - the description of the tier

```solidity
struct VestingSettings {
    uint256 vestingPercentage;
    uint64 vestingDuration;
    uint64 cliffPeriod;
    uint64 unlockStep;
}
```

- ***vestingPercentage*** - percentage of the purchased token amount that goes to vesting
- ***vestingDuration*** - how long vesting lasts from the time of the token purchase
- ***cliffPeriod*** - how long the user cannot make a vesting withdrawal from the time of the token purchase
- ***unlockStep*** - the tick step with which funds from the vesting are given to the buyer

```solidity
struct ParticipationDetails {
    ParticipationType participationType;
    bytes data;
}
```

- ***participationType*** - the type of requirements to participate in the tier
- ***data*** - the additional data associated with the participation requirements

```solidity
enum ParticipationType {
    DAOVotes,
    Whitelist,
    BABT,
    TokenLock,
    NftLock
}
```

- ***DAOVotes*** - indicates that the user must have the required voting power
- ***Whitelist*** - indicates that the user must be included in the whitelist of the tier
- ***BABT*** - indicates that the user must own the BABT token
- ***TokenLock*** - indicates that the user must lock a specific amount of tokens in the tier
- ***NftLock*** - indicates that the user must lock an nft in the tier

#

Function ***`buy()`*** is used to purchase tokens in the given tier.

```solidity
function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;
```

- ***tierId*** - id of tier where tokens will be purchased
- ***tokenToBuyWith*** - another token that will be used (exchanged) to purchase token on the token sale
- ***amount*** - amount of another token another to be used for this exchange.

#

Function ***`addToWhitelist()`*** is used to add users to the whitelist of tier.

❗ The following function is used only for tiers with the `Whitelist` participation requirement type.

```solidity
function addToWhitelist(WhitelistingRequest[] calldata requests) external onlyGov;
```

- ***requests*** - requests for adding users to the whitelist

```solidity
struct WhitelistingRequest {
    uint256 tierId;
    address[] users;
    string uri;
}
```

- ***tierId*** - the id of the tier
- ***users*** -  list of the users to be whitelisted
- ***uri*** - tokens metadata uri

#

Function ***`lockParticipationTokens()`*** is used to lock the specified amount of tokens to participate in the given tier.

❗ The following function is used only for tiers with the `TokenLock` participation requirement type.

```solidity
function lockParticipationTokens(
    uint256 tierId,
    address tokenToLock,
    uint256 amountToLock
) external payable;
```

- ***tierId*** - the id of the tier to lock the tokens for
- ***tokenToLock*** - the address of the token to be locked
- ***amountToLock*** - the number of tokens to be locked

#

Function ***`lockParticipationNft()`*** is used to lock the specified nft to participate in the given tier.

❗ The following function is used only for tiers with the `NftLock` participation requirement type.

```solidity
function lockParticipationNft(
    uint256 tierId,
    address nftToLock,
    uint256[] calldata nftIdsToLock
) external;
```

- ***tierId*** - the id of the tier to lock the nft for
- ***nftToLock** - the address of nft to be locked
- ***nftIdsToLock*** - the list of nft ids to be locked

#

Function ***`unlockParticipationTokens()`*** is used to unlock participation tokens.

❗ The following function is used only for tiers with the `TokenLock` participation requirement type.

```solidity
function unlockParticipationTokens(
    uint256 tierId,
    address tokenToUnlock,
    uint256 amountToUnlock
) external;
```

- ***tierId*** - the id of the tier to unlock the tokens for
- ***tokenToUnlock*** - the address of the token to be unlocked
- ***amountToUnlock*** - the number of tokens to be unlocked

#

Function ***`unlockParticipationNft()`*** is used to unlock the participation nft.

❗ The following function is used only for tiers with the `NftLock` participation requirement type.

```solidity
function unlockParticipationNft(
    uint256 tierId,
    address nftToUnlock,
    uint256[] calldata nftIdsToUnlock
) external;
```

- ***tierId*** - the id of the tier to unlock the nft for
- ***nftToUnlock*** - the address of nft to be unlocked
- ***nftIdsToUnlock*** - the list of nft ids to be unlocked

#

Function ***`claim()`*** is used to withdraw non-vesting tokens from given tiers.

```solidity
function claim(uint256[] calldata tierIds) external;
```

- ***tierIds*** - tier ids to make withdrawals from

#

Function ***`latestTierId()`*** is used to get id (index) of the latest tier of the token sale.

```solidity
function latestTierId() external view returns (uint256);
```

- **returns** **->** the id of the latest tier

#

Function ***`offTiers()`*** is used to set given tiers inactive.

```solidity
function offTiers(uint256[] calldata tierIds) external onlyGov;
```

- ***tierIds*** - tier ids to set inactive

#

Function ***`claim()`*** is used to withdraw non-vesting tokens from given tiers.

```solidity
function claim(uint256[] calldata tierIds) external;
```

- ***tierIds*** - tier ids to make withdrawals from

#

Function ***`vestingWithdraw()`*** is used to withdraw tokens from given tiers.

```solidity
function vestingWithdraw(uint256[] calldata tierIds) external;
```

- ***tierIds*** - tier ids to make withdrawals from

#

Function ***`recover()`*** is used to return to the **DAO** treasury tokens that have not been purchased during sale.

```solidity
function recover(uint256[] calldata tierIds) external onlyGov; 
```

- ***tierIds*** - tier ids to recover from

#

Function ***`getSaleTokenAmount()`*** is used to get amount of `TokenSaleProposal` tokens that can be purchased.

```solidity
function getSaleTokenAmount(
    address user,
    uint256 tierId,
    address tokenToBuyWith,
    uint256 amount
) public view returns (uint256);
```

- ***user*** - address of the user that purchases tokens
- ***tierId*** - in which tier tokens are purchased
- ***tokenToBuyWith*** - the token which is used for exchange
- ***amount*** - the token amount used for exchange
- **returns** **->** expected sale token amount

#

Function ***`getVestingWithdrawAmounts()`*** is used to get information about the amount of tokens that user can withdraw (that are unlocked) from given tiers.

```solidity
function getVestingWithdrawAmounts(
    address user,
    uint256[] calldata tierIds
) public view returns (uint256[] memory vestingWithdrawAmounts);
```

- ***user*** - the address of the user
- ***tierIds*** - the array of tier ids
- **returns** **->** array of token amounts that can be withdrawn from each tier

#

Function ***`getRecoverAmounts()`*** is used to get amount of tokens that have not been purchased during sale in given tiers and can be returned to **DAO** treasury.

```solidity
function getRecoverAmounts(
    uint256[] calldata tierIds
) public view returns (uint256[] memory recoveringAmounts);
```

- ***tierIds*** - the array of tier ids
- **returns** **->** array of token amounts that can be returned to **DAO** treasury in each tier

#

Function ***`getTiers()`*** is used to get a list of tiers.

```solidity
function getTierViews(
    uint256 offset,
    uint256 limit
) external view returns (TierView[] memory tierViews);

```

- ***offset*** - offset of the list
- ***limit*** - limit for amount of elements in the list
- **returns** **->** list of tier parameters
