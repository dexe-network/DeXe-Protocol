# ITokenSaleProposal

## Interface Description


License: MIT

## 

```solidity
interface ITokenSaleProposal
```

The contract for the additional proposal with custom settings.
This contract acts as a marketplace to provide DAO pools with the ability to sell their own ERC20 tokens.
## Enums info

### ParticipationType

```solidity
enum ParticipationType {
	 DAOVotes,
	 Whitelist,
	 BABT,
	 TokenLock,
	 NftLock
}
```

The enum that represents the type of requirements to participate in the tier


Parameters:

| Name      | Description                                                                |
| :-------- | :------------------------------------------------------------------------- |
| DAOVotes  | indicates that the user must have the required voting power                |
| Whitelist | indicates that the user must be included in the whitelist of the tier      |
| BABT      | indicates that the user must own the BABT token                            |
| TokenLock | indicates that the user must lock a specific amount of tokens in the tier  |
| NftLock   | indicates that the user must lock an nft in the tier                       |

## Structs info

### TierMetadata

```solidity
struct TierMetadata {
	string name;
	string description;
}
```

Metadata of the tier that is part of the initial tier parameters


Parameters:

| Name        | Type   | Description                 |
| :---------- | :----- | :-------------------------- |
| name        | string | the name of the tier        |
| description | string | the description of the tier |

### VestingSettings

```solidity
struct VestingSettings {
	uint256 vestingPercentage;
	uint64 vestingDuration;
	uint64 cliffPeriod;
	uint64 unlockStep;
}
```

Vesting parameters that are part of the initial tier parameters


Parameters:

| Name              | Type    | Description                                                                             |
| :---------------- | :------ | :-------------------------------------------------------------------------------------- |
| vestingPercentage | uint256 | percentage of the purchased token amount that goes to vesting                           |
| vestingDuration   | uint64  | how long vesting lasts from the time of the token purchase                              |
| cliffPeriod       | uint64  | how long the user cannot make a vesting withdrawal from the time of the token purchase  |
| unlockStep        | uint64  | the tick step with which funds from the vesting are given to the buyer                  |

### ParticipationDetails

```solidity
struct ParticipationDetails {
	ITokenSaleProposal.ParticipationType participationType;
	bytes data;
}
```

Participation details that are part of the initial tier parameters


Parameters:

| Name              | Type                                      | Description                                                        |
| :---------------- | :---------------------------------------- | :----------------------------------------------------------------- |
| participationType | enum ITokenSaleProposal.ParticipationType | the type of requirements to participate in the tier                |
| data              | bytes                                     | the additional data associated with the participation requirements |

### TierInitParams

```solidity
struct TierInitParams {
	ITokenSaleProposal.TierMetadata metadata;
	uint256 totalTokenProvided;
	uint64 saleStartTime;
	uint64 saleEndTime;
	uint64 claimLockDuration;
	address saleTokenAddress;
	address[] purchaseTokenAddresses;
	uint256[] exchangeRates;
	uint256 minAllocationPerUser;
	uint256 maxAllocationPerUser;
	ITokenSaleProposal.VestingSettings vestingSettings;
	ITokenSaleProposal.ParticipationDetails[] participationDetails;
}
```

Initial tier parameters


Parameters:

| Name                   | Type                                             | Description                                                                                                         |
| :--------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| metadata               | struct ITokenSaleProposal.TierMetadata           | metadata of the tier (see TierMetadata)                                                                             |
| totalTokenProvided     | uint256                                          | total supply of tokens provided for the tier                                                                        |
| saleStartTime          | uint64                                           | start time of token sales                                                                                           |
| saleEndTime            | uint64                                           | end time of token sales                                                                                             |
| claimLockDuration      | uint64                                           | the period of time between the end of the token sale and the non-vesting tokens claiming                            |
| saleTokenAddress       | address                                          | address of the token being sold                                                                                     |
| purchaseTokenAddresses | address[]                                        | tokens, that can be used for purchasing token of the proposal                                                       |
| exchangeRates          | uint256[]                                        | exchange rates of other tokens to the token of TokenSaleProposal                                                    |
| minAllocationPerUser   | uint256                                          | minimal allocation of tokens per one user                                                                           |
| maxAllocationPerUser   | uint256                                          | maximal allocation of tokens per one user                                                                           |
| vestingSettings        | struct ITokenSaleProposal.VestingSettings        | settings for managing tokens vesting (unlocking). While tokens are locked investors won`t be able to withdraw them  |
| participationDetails   | struct ITokenSaleProposal.ParticipationDetails[] | the list of participation requirement parameters                                                                    |

### VestingTierInfo

```solidity
struct VestingTierInfo {
	uint64 vestingStartTime;
	uint64 vestingEndTime;
}
```

Vesting tier-related parameters


Parameters:

| Name             | Type   | Description                                               |
| :--------------- | :----- | :-------------------------------------------------------- |
| vestingStartTime | uint64 | the start time of the vesting when the cliff period ends  |
| vestingEndTime   | uint64 | the end time of the vesting                               |

### TierInfo

```solidity
struct TierInfo {
	bool isOff;
	uint256 totalSold;
	string uri;
	ITokenSaleProposal.VestingTierInfo vestingTierInfo;
}
```

Dynamic tier parameters


Parameters:

| Name            | Type                                      | Description                 |
| :-------------- | :---------------------------------------- | :-------------------------- |
| isOff           | bool                                      | whether the tier is off     |
| totalSold       | uint256                                   | how many tokens were sold   |
| uri             | string                                    | whitelist uri               |
| vestingTierInfo | struct ITokenSaleProposal.VestingTierInfo | vesting tier-related params |

### PurchaseInfo

```solidity
struct PurchaseInfo {
	EnumerableMap.AddressToUintMap spentAmounts;
	uint256 claimTotalAmount;
	bool isClaimed;
	EnumerableMap.AddressToUintMap lockedTokens;
	EnumerableSet.AddressSet lockedNftAddresses;
	mapping(address => EnumerableSet.UintSet) lockedNfts;
}
```

Purchase parameters


Parameters:

| Name               | Type                                             | Description                                                          |
| :----------------- | :----------------------------------------------- | :------------------------------------------------------------------- |
| spentAmounts       | struct EnumerableMap.AddressToUintMap            | matching purchase token addresses with spent amounts                 |
| claimTotalAmount   | uint256                                          | the total amount to be claimed                                       |
| isClaimed          | bool                                             | the boolean indicating whether the purchase has been claimed or not  |
| lockedTokens       | struct EnumerableMap.AddressToUintMap            | matching user locked tokens to locked amounts                        |
| lockedNftAddresses | struct EnumerableSet.AddressSet                  | the list of nft addresses locked by the user                         |
| lockedNfts         | mapping(address => struct EnumerableSet.UintSet) | the list of nft ids locked by the user                               |

### PurchaseView

```solidity
struct PurchaseView {
	bool isClaimed;
	bool canClaim;
	uint64 claimUnlockTime;
	uint256 claimTotalAmount;
	uint256 boughtTotalAmount;
	address[] lockedTokenAddresses;
	uint256[] lockedTokenAmounts;
	address[] lockedNftAddresses;
	uint256[][] lockedNftIds;
	address[] purchaseTokenAddresses;
	uint256[] purchaseTokenAmounts;
}
```

Purchase parameters. This struct is used in view functions as part of a return argument


Parameters:

| Name                   | Type        | Description                                                                      |
| :--------------------- | :---------- | :------------------------------------------------------------------------------- |
| isClaimed              | bool        | the boolean indicating whether non-vesting tokens have been claimed or not       |
| canClaim               | bool        | the boolean indication whether the user can claim non-vesting tokens             |
| claimUnlockTime        | uint64      | the time the user can claim its non-vesting tokens                               |
| claimTotalAmount       | uint256     | the total amount of tokens to be claimed                                         |
| boughtTotalAmount      | uint256     | the total amount of tokens user bought including vesting and non-vesting tokens  |
| lockedTokenAddresses   | address[]   | the list of locked token addresses                                               |
| lockedTokenAmounts     | uint256[]   | the list of locked token amounts                                                 |
| lockedNftAddresses     | address[]   | the list of locked nft addresses                                                 |
| lockedNftIds           | uint256[][] | the list of locked nft ids                                                       |
| purchaseTokenAddresses | address[]   | the list of purchase token addresses                                             |
| purchaseTokenAmounts   | uint256[]   | the list of purchase token amounts                                               |

### VestingUserInfo

```solidity
struct VestingUserInfo {
	uint64 latestVestingWithdraw;
	uint256 vestingTotalAmount;
	uint256 vestingWithdrawnAmount;
}
```

Vesting user-related parameters


Parameters:

| Name                   | Type    | Description                                                |
| :--------------------- | :------ | :--------------------------------------------------------- |
| latestVestingWithdraw  | uint64  | the latest timestamp of the vesting withdrawal             |
| vestingTotalAmount     | uint256 | the total amount of user vesting tokens                    |
| vestingWithdrawnAmount | uint256 | the total amount of tokens user has withdrawn from vesting |

### VestingUserView

```solidity
struct VestingUserView {
	uint64 latestVestingWithdraw;
	uint64 nextUnlockTime;
	uint256 nextUnlockAmount;
	uint256 vestingTotalAmount;
	uint256 vestingWithdrawnAmount;
	uint256 amountToWithdraw;
	uint256 lockedAmount;
}
```

Vesting user-related parameters. This struct is used in view functions as part of a return argument


Parameters:

| Name                   | Type    | Description                                                                                       |
| :--------------------- | :------ | :------------------------------------------------------------------------------------------------ |
| latestVestingWithdraw  | uint64  | the latest timestamp of the vesting withdrawal                                                    |
| nextUnlockTime         | uint64  | the next time the user will receive vesting funds. It is zero if there are no more locked tokens  |
| nextUnlockAmount       | uint256 | the token amount which will be unlocked in the next unlock time                                   |
| vestingTotalAmount     | uint256 | the total amount of user vesting tokens                                                           |
| vestingWithdrawnAmount | uint256 | the total amount of tokens user has withdrawn from vesting                                        |
| amountToWithdraw       | uint256 | the vesting token amount which can be withdrawn in the current time                               |
| lockedAmount           | uint256 | the vesting token amount which is locked in the current time                                      |

### ParticipationInfo

```solidity
struct ParticipationInfo {
	bool isWhitelisted;
	bool isBABTed;
	uint256 requiredDaoVotes;
	EnumerableMap.AddressToUintMap requiredTokenLock;
	EnumerableMap.AddressToUintMap requiredNftLock;
}
```

Participation parameters. Users should meet all the requirements in order to participate in the tier


Parameters:

| Name              | Type                                  | Description                                                  |
| :---------------- | :------------------------------------ | :----------------------------------------------------------- |
| isWhitelisted     | bool                                  | the boolean indicating whether the tier requires whitelist   |
| isBABTed          | bool                                  | the boolean indicating whether the tier requires BABT token  |
| requiredDaoVotes  | uint256                               | the required amount of DAO votes                             |
| requiredTokenLock | struct EnumerableMap.AddressToUintMap | matching token address to required lock amounts              |
| requiredNftLock   | struct EnumerableMap.AddressToUintMap | matching nft address to required lock amounts                |

### UserInfo

```solidity
struct UserInfo {
	ITokenSaleProposal.PurchaseInfo purchaseInfo;
	ITokenSaleProposal.VestingUserInfo vestingUserInfo;
}
```

User parameters


Parameters:

| Name            | Type                                      | Description                              |
| :-------------- | :---------------------------------------- | :--------------------------------------- |
| purchaseInfo    | struct ITokenSaleProposal.PurchaseInfo    | the information about the user purchase  |
| vestingUserInfo | struct ITokenSaleProposal.VestingUserInfo | the information about the user vesting   |

### UserView

```solidity
struct UserView {
	bool canParticipate;
	ITokenSaleProposal.PurchaseView purchaseView;
	ITokenSaleProposal.VestingUserView vestingUserView;
}
```

User parameters. This struct is used in view functions as a return argument


Parameters:

| Name            | Type                                      | Description                                                                       |
| :-------------- | :---------------------------------------- | :-------------------------------------------------------------------------------- |
| canParticipate  | bool                                      | the boolean indicating whether the user is whitelisted in the corresponding tier  |
| purchaseView    | struct ITokenSaleProposal.PurchaseView    | the information about the user purchase                                           |
| vestingUserView | struct ITokenSaleProposal.VestingUserView | the information about the user vesting                                            |

### Tier

```solidity
struct Tier {
	ITokenSaleProposal.TierInitParams tierInitParams;
	ITokenSaleProposal.TierInfo tierInfo;
	ITokenSaleProposal.ParticipationInfo participationInfo;
	mapping(address => uint256) rates;
	mapping(address => ITokenSaleProposal.UserInfo) users;
}
```

Tier parameters


Parameters:

| Name              | Type                                                   | Description                                             |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------------ |
| tierInitParams    | struct ITokenSaleProposal.TierInitParams               | the initial tier parameters                             |
| tierInfo          | struct ITokenSaleProposal.TierInfo                     | the information about the tier                          |
| participationInfo | struct ITokenSaleProposal.ParticipationInfo            | the information about participation requirements        |
| rates             | mapping(address => uint256)                            | the mapping of token addresses to their exchange rates  |
| users             | mapping(address => struct ITokenSaleProposal.UserInfo) | the mapping of user addresses to their infos            |

### TierView

```solidity
struct TierView {
	ITokenSaleProposal.TierInitParams tierInitParams;
	ITokenSaleProposal.TierInfo tierInfo;
}
```

Tier parameters. This struct is used in view functions as a return argument


Parameters:

| Name           | Type                                     | Description                    |
| :------------- | :--------------------------------------- | :----------------------------- |
| tierInitParams | struct ITokenSaleProposal.TierInitParams | the initial tier parameters    |
| tierInfo       | struct ITokenSaleProposal.TierInfo       | the information about the tier |

### WhitelistingRequest

```solidity
struct WhitelistingRequest {
	uint256 tierId;
	address[] users;
	string uri;
}
```

Whitelisting request parameters. This struct is used as an input parameter to the whitelist update function


Parameters:

| Name   | Type      | Description                              |
| :----- | :-------- | :--------------------------------------- |
| tierId | uint256   | the id of the tier                       |
| users  | address[] | the list of the users to be whitelisted  |
| uri    | string    | tokens metadata uri                      |

## Functions info

### latestTierId (0x83d36375)

```solidity
function latestTierId() external view returns (uint256)
```

This function is used to get id (index) of the latest tier of the token sale


Return values:

| Name | Type    | Description               |
| :--- | :------ | :------------------------ |
| [0]  | uint256 | the id of the latest tier |

### createTiers (0x6a6effda)

```solidity
function createTiers(
    ITokenSaleProposal.TierInitParams[] calldata tiers
) external
```

This function is used for tiers creation


Parameters:

| Name  | Type                                       | Description         |
| :---- | :----------------------------------------- | :------------------ |
| tiers | struct ITokenSaleProposal.TierInitParams[] | parameters of tiers |

### addToWhitelist (0xce6c2d91)

```solidity
function addToWhitelist(
    ITokenSaleProposal.WhitelistingRequest[] calldata requests
) external
```

This function is used to add users to the whitelist of tier


Parameters:

| Name     | Type                                            | Description                                |
| :------- | :---------------------------------------------- | :----------------------------------------- |
| requests | struct ITokenSaleProposal.WhitelistingRequest[] | requests for adding users to the whitelist |

### offTiers (0x20274396)

```solidity
function offTiers(uint256[] calldata tierIds) external
```

This function is used to set given tiers inactive


Parameters:

| Name    | Type      | Description              |
| :------ | :-------- | :----------------------- |
| tierIds | uint256[] | tier ids to set inactive |

### recover (0xc59b695a)

```solidity
function recover(uint256[] calldata tierIds) external
```

This function is used to return to the DAO treasury tokens that have not been purchased during sale


Parameters:

| Name    | Type      | Description              |
| :------ | :-------- | :----------------------- |
| tierIds | uint256[] | tier ids to recover from |

### claim (0x6ba4c138)

```solidity
function claim(uint256[] calldata tierIds) external
```

This function is used to withdraw non-vesting tokens from given tiers


Parameters:

| Name    | Type      | Description                       |
| :------ | :-------- | :-------------------------------- |
| tierIds | uint256[] | tier ids to make withdrawals from |

### vestingWithdraw (0xe2bdc496)

```solidity
function vestingWithdraw(uint256[] calldata tierIds) external
```

This function is used to withdraw vesting tokens from given tiers


Parameters:

| Name    | Type      | Description                       |
| :------ | :-------- | :-------------------------------- |
| tierIds | uint256[] | tier ids to make withdrawals from |

### buy (0x2afaca20)

```solidity
function buy(
    uint256 tierId,
    address tokenToBuyWith,
    uint256 amount
) external payable
```

This function is used to purchase tokens in the given tier


Parameters:

| Name           | Type    | Description                                                                  |
| :------------- | :------ | :--------------------------------------------------------------------------- |
| tierId         | uint256 | the id of the tier where tokens will be purchased                            |
| tokenToBuyWith | address | the token that will be used (exchanged) to purchase token on the token sale  |
| amount         | uint256 | the amount of the token to be used for this exchange                         |

### lockParticipationTokens (0x66813a3b)

```solidity
function lockParticipationTokens(
    uint256 tierId,
    address tokenToLock,
    uint256 amountToLock
) external payable
```

This function is used to lock the specified amount of tokens to participate in the given tier


Parameters:

| Name         | Type    | Description                                |
| :----------- | :------ | :----------------------------------------- |
| tierId       | uint256 | the id of the tier to lock the tokens for  |
| tokenToLock  | address | the address of the token to be locked      |
| amountToLock | uint256 | the number of tokens to be locked          |

### lockParticipationNft (0x1ec3f9b7)

```solidity
function lockParticipationNft(
    uint256 tierId,
    address nftToLock,
    uint256[] calldata nftIdsToLock
) external
```

This function is used to lock the specified nft to participate in the given tier


Parameters:

| Name         | Type      | Description                             |
| :----------- | :-------- | :-------------------------------------- |
| tierId       | uint256   | the id of the tier to lock the nft for  |
| nftToLock    | address   | the address of nft to be locked         |
| nftIdsToLock | uint256[] | the list of nft ids to be locked        |

### unlockParticipationTokens (0x78ee27d7)

```solidity
function unlockParticipationTokens(
    uint256 tierId,
    address tokenToUnlock,
    uint256 amountToUnlock
) external
```

This function is used to unlock participation tokens


Parameters:

| Name           | Type    | Description                                  |
| :------------- | :------ | :------------------------------------------- |
| tierId         | uint256 | the id of the tier to unlock the tokens for  |
| tokenToUnlock  | address | the address of the token to be unlocked      |
| amountToUnlock | uint256 | the number of tokens to be unlocked          |

### unlockParticipationNft (0x9471f309)

```solidity
function unlockParticipationNft(
    uint256 tierId,
    address nftToUnlock,
    uint256[] calldata nftIdsToUnlock
) external
```

This function is used to unlock the participation nft


Parameters:

| Name           | Type      | Description                               |
| :------------- | :-------- | :---------------------------------------- |
| tierId         | uint256   | the id of the tier to unlock the nft for  |
| nftToUnlock    | address   | the address of nft to be unlocked         |
| nftIdsToUnlock | uint256[] | the list of nft ids to be unlocked        |

### getSaleTokenAmount (0xceded63c)

```solidity
function getSaleTokenAmount(
    address user,
    uint256 tierId,
    address tokenToBuyWith,
    uint256 amount
) external view returns (uint256)
```

This function is used to get amount of `TokenSaleProposal` tokens that can be purchased


Parameters:

| Name           | Type    | Description                                       |
| :------------- | :------ | :------------------------------------------------ |
| user           | address | the address of the user that purchases tokens     |
| tierId         | uint256 | the id of the tier in which tokens are purchased  |
| tokenToBuyWith | address | the token which is used for exchange              |
| amount         | uint256 | the token amount used for exchange                |


Return values:

| Name | Type    | Description                |
| :--- | :------ | :------------------------- |
| [0]  | uint256 | expected sale token amount |

### getClaimAmounts (0xd6e93fb2)

```solidity
function getClaimAmounts(
    address user,
    uint256[] calldata tierIds
) external view returns (uint256[] memory claimAmounts)
```

This function is used to get information about the amount of non-vesting tokens that user can withdraw (that are unlocked) from given tiers


Parameters:

| Name    | Type      | Description              |
| :------ | :-------- | :----------------------- |
| user    | address   | the address of the user  |
| tierIds | uint256[] | the array of tier ids    |


Return values:

| Name         | Type      | Description                                                     |
| :----------- | :-------- | :-------------------------------------------------------------- |
| claimAmounts | uint256[] | the array of token amounts that can be withdrawn from each tier |

### getVestingWithdrawAmounts (0x47d436f7)

```solidity
function getVestingWithdrawAmounts(
    address user,
    uint256[] calldata tierIds
) external view returns (uint256[] memory vestingWithdrawAmounts)
```

This function is used to get information about the amount of vesting tokens that user can withdraw (that are unlocked) from given tiers


Parameters:

| Name    | Type      | Description              |
| :------ | :-------- | :----------------------- |
| user    | address   | the address of the user  |
| tierIds | uint256[] | the array of tier ids    |


Return values:

| Name                   | Type      | Description                                                     |
| :--------------------- | :-------- | :-------------------------------------------------------------- |
| vestingWithdrawAmounts | uint256[] | the array of token amounts that can be withdrawn from each tier |

### getRecoverAmounts (0x69bc02d5)

```solidity
function getRecoverAmounts(
    uint256[] calldata tierIds
) external view returns (uint256[] memory recoveringAmounts)
```

This function is used to get amount of tokens that have not been purchased during sale in given tiers and can be returned to DAO treasury


Parameters:

| Name    | Type      | Description            |
| :------ | :-------- | :--------------------- |
| tierIds | uint256[] | the array of tier ids  |


Return values:

| Name              | Type      | Description                                                                  |
| :---------------- | :-------- | :--------------------------------------------------------------------------- |
| recoveringAmounts | uint256[] | the array of token amounts that can be returned to DAO treasury in each tier |

### getTierViews (0x884ce0bd)

```solidity
function getTierViews(
    uint256 offset,
    uint256 limit
) external view returns (ITokenSaleProposal.TierView[] memory tierViews)
```

This function is used to get a list of tiers


Parameters:

| Name   | Type    | Description                                   |
| :----- | :------ | :-------------------------------------------- |
| offset | uint256 | the offset of the list                        |
| limit  | uint256 | the limit for amount of elements in the list  |


Return values:

| Name      | Type                                 | Description            |
| :-------- | :----------------------------------- | :--------------------- |
| tierViews | struct ITokenSaleProposal.TierView[] | the list of tier views |

### getUserViews (0xb27f37a2)

```solidity
function getUserViews(
    address user,
    uint256[] calldata tierIds
) external view returns (ITokenSaleProposal.UserView[] memory userViews)
```

This function is used to get user's infos from tiers


Parameters:

| Name    | Type      | Description                                       |
| :------ | :-------- | :------------------------------------------------ |
| user    | address   | the address of the user whose infos are required  |
| tierIds | uint256[] | the list of tier ids to get infos from            |


Return values:

| Name      | Type                                 | Description            |
| :-------- | :----------------------------------- | :--------------------- |
| userViews | struct ITokenSaleProposal.UserView[] | the list of user views |
