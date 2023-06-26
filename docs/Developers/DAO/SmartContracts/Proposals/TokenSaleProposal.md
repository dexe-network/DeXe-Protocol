# 💲 Token Sale Proposal

**DAO** pools could issue their own **ERC20** token and sell it to investors with custom sale logic.

#

Function ***`createTiers()`*** is used for tiers creation.

```solidity
function createTiers(TierView[] calldata tiers) external onlyGov;
```

- ***tiers*** - parameters of tiers

```solidity
struct TierView {
    TierMetadata metadata;
    uint256 totalTokenProvided;
    uint64 saleStartTime;
    uint64 saleEndTime;
    address saleTokenAddress;
    address[] purchaseTokenAddresses;
    uint256[] exchangeRates;
    uint256 minAllocationPerUser;
    uint256 maxAllocationPerUser;
    VestingSettings vestingSettings;
}
```

- ***metadata*** - metadata of the tier (see `TierMetadata`)
- ***totalTokenProvided*** - total supply of tokens provided for the tier
- ***saleStartTime*** - start time of token sales
- ***saleEndTime*** - end time of token sales
- ***saleTokenAddress*** - address of the token being sold
- ***purchaseTokenAddresses*** - tokens, that can be used for purchasing token of the proposal
- ***exchangeRates*** - exchange rates of other tokens to the token of `TokenSaleProposal`
- ***minAllocationPerUser*** - minimal allocation of tokens per one user
- ***maxAllocationPerUser*** - maximal allocation of tokens per one user
- ***vestingSettings*** - settings for managing tokens vesting (unlocking). While tokens are locked investors won`t be able to withdraw them.

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

#

Function ***buy()*** is used to purchase tokens in the given tier.

```solidity
function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;
```

- ***tierId*** - id of tier where tokens will be purchased
- ***tokenToBuyWith*** - another token that will be used (exchanged) to purchase token on the token sale
- ***amount*** - amount of another token another to be used for this exchange.

#

Function ***`addToWhitelist()`*** is used to add users to the whitelist of tier.

❗ If no user added to whitelist, anyone can buy tokens. Otherwise, only users from whitelist can buy tokens.

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
) public view ifTierExists(tierId) ifTierIsNotOff(tierId) returns (uint256);
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
function getTiers(
    uint256 offset,
    uint256 limit
) external view returns (TierView[] memory tierViews, TierInfoView[] memory tierInfoViews);
```

- ***offset*** - offset of the list
- ***limit*** - limit for amount of elements in the list
- **returns** **->** list of initial tier parameters
- **returns** **->** list of dynamic tier parameters
