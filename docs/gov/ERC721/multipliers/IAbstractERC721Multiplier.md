# IAbstractERC721Multiplier

## Interface Description


License: MIT

## 

```solidity
interface IAbstractERC721Multiplier is IERC721EnumerableUpgradeable
```

This is the special NFT contract which behaves like a coupon that can be locked to receive
certain extra rewards proportional to the rewards in the Governance pool contract
## Structs info

### NftInfo

```solidity
struct NftInfo {
	uint256 multiplier;
	uint64 duration;
	uint64 mintedAt;
}
```

This struct holds NFT Multiplier parameters


Parameters:

| Name       | Type    | Description                              |
| :--------- | :------ | :--------------------------------------- |
| multiplier | uint256 | the basic rewards multiplier             |
| duration   | uint64  | the time for which an nft can be locked  |
| mintedAt   | uint64  | the time nft was minter                  |

## Functions info

### lock (0xdd467064)

```solidity
function lock(uint256 tokenId) external
```

This function is used to lock an nft (enable corresponding basic rewards multiplier).
Only one NFT for each address can be locked at the same time


Parameters:

| Name    | Type    | Description                    |
| :------ | :------ | :----------------------------- |
| tokenId | uint256 | the id of the nft to be locked |

### unlock (0xa69df4b5)

```solidity
function unlock() external
```

This function is used to unlock an nft (disable corresponding basic rewards multiplier)
### getExtraRewards (0x1429683b)

```solidity
function getExtraRewards(
    address whose,
    uint256 rewards
) external view returns (uint256)
```

This function is used to calculate extra rewards


Parameters:

| Name    | Type    | Description                                              |
| :------ | :------ | :------------------------------------------------------- |
| whose   | address | the address of the user who is to receive extra rewards  |
| rewards | uint256 | basic rewards to be multiplied                           |


Return values:

| Name | Type    | Description   |
| :--- | :------ | :------------ |
| [0]  | uint256 | extra rewards |

### isLocked (0xf6aacfb1)

```solidity
function isLocked(uint256 tokenId) external view returns (bool)
```

This function is used to check whether the passed nft id is locked


Parameters:

| Name    | Type    | Description        |
| :------ | :------ | :----------------- |
| tokenId | uint256 | the id of the nft  |


Return values:

| Name | Type | Description                                                        |
| :--- | :--- | :----------------------------------------------------------------- |
| [0]  | bool | false if nft has expired or hasn't yet been locked, otherwise true |
