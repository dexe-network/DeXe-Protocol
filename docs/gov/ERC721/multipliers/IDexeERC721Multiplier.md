# IDexeERC721Multiplier

## Interface Description


License: MIT

## 

```solidity
interface IDexeERC721Multiplier is IAbstractERC721Multiplier
```


## Functions info

### changeToken (0xa0545331)

```solidity
function changeToken(
    uint256 tokenId,
    uint256 multiplier,
    uint64 duration,
    uint256 averageBalance
) external
```

This function is used to change the basic rewards multiplier and the time for which the current nft will be locked


Parameters:

| Name           | Type    | Description                              |
| :------------- | :------ | :--------------------------------------- |
| tokenId        | uint256 | the id of the nft to be changed          |
| multiplier     | uint256 | the basic rewards multiplier             |
| duration       | uint64  | the time for which an nft can be locked  |
| averageBalance | uint256 | the average balance of the user's tokens |

### getCurrentMultiplier (0xc914c789)

```solidity
function getCurrentMultiplier(
    address whose,
    uint256 rewards
) external view returns (uint256 multiplier, uint256 timeLeft)
```

This function is used to get the current rewards multiplier and the time for which the current nft will be locked


Parameters:

| Name    | Type    | Description                            |
| :------ | :------ | :------------------------------------- |
| whose   | address | the address of the user to be checked  |
| rewards | uint256 | basic rewards to be multiplied         |


Return values:

| Name       | Type    | Description                                             |
| :--------- | :------ | :------------------------------------------------------ |
| multiplier | uint256 | the rewards multiplier                                  |
| timeLeft   | uint256 | seconds remaining before the current locked nft expires |
