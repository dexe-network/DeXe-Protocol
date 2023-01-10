# 💲 Token Sale Proposal

**DAO** pools could issue their own **ERC20** token and sell it to investors with custom sale logic.

#

Function ***`createTiers()`*** is used for tiers creation.

```solidity
function createTiers(TierView[] calldata tiers) external onlyGov;
```
- ***tiers*** - parameters of tiers 

```
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

```solidity
struct VestingSettings {
    uint256 vestingPercentage;
    uint256 vestingDuration;
    uint256 cliffPeriod;
    uint256 unlockStep;
}
```

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

❗ If no user added to whitelist, anyone can buy tokens. Otherwise only users from whitelist can buy tokens.

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

#

Function ***`latestTierId()`*** is used to get id (index) of the latest tier of the token sale. 

```solidity
function latestTierId() external view returns (uint256);
```

#

Function ***`offTiers()`*** is used to set given tiers inactive.

```solidity
function offTiers(uint256[] calldata tierIds) external onlyGov;
```

# 

Function ***`vestingWithdraw()`*** is used to withdraw tokens from given tiers.

```solidity
function vestingWithdraw(uint256[] calldata tierIds) external;
```

#

Function ***`recover()`*** is used to return to the **DAO** treasury tokens that have not been purchased during sale.

```solidity
function recover(uint256[] calldata tierIds) external;
```

#

Function ***`getSaleTokenAmount()`*** is used to get amount of `TokenSaleProposal` tokens that can be purchased.

```solidity
function getSaleTokenAmount(
    address user,
    uint256 tierId,
    address tokenToBuyWith,
    uint256 amount
) external returns (uint256);
```
- ***user*** - address of the user that purchases tokens
- ***tierId*** - in which tier tokens are purchesed
- ***tokenToBuyWith*** - which tokens are used for exchange
- ***amount*** - amount of tokens used for exchange

#

Function ***`getVestingWithdrawAmounts()`*** is used to get information about the amount of tokens that user can withdraw (that are unlocked) from given tiers. 

```solidity
function getVestingWithdrawAmounts(
    address user,
    uint256[] calldata tierIds
) external returns (uint256[] memory vestingWithdrawAmounts);
```
- ***user*** - the address of the user
- ***tierIds*** - the array of tier ids 
- **returns** **->** array of token amounts that can be withdrawn from each tier

#

Function ***`getRecoverAmounts()`*** is used to get amount of tokens that have not been purchased during sale in given tiers and can be returned to **DAO** treasury.

```solidity
function getRecoverAmounts(
    uint256[] calldata tierIds
) external returns (uint256[] memory recoveringAmounts);
```
- ***tierIds*** - the array of tier ids 
- **returns** **->** array of token amounts that can be returned to **DAO** treasury in each tier

#

Function ***`getTiers()`*** is used to get a list of tiers.

```solidity
function getTiers(
    uint256 offset,
    uint256 limit
) external 
  returns (TierView[] memory tierViews, TierInfoView[] memory tierInfoViews);
```
- ***offset*** - offset of the list
- ***limit*** - limit for amount of elements in the list 