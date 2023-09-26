# IERC721Multiplier

## Interface Description


License: MIT

## 

```solidity
interface IERC721Multiplier is IAbstractERC721Multiplier
```


## Functions info

### mint (0x8b3d35ae)

```solidity
function mint(address to, uint256 multiplier, uint64 duration) external
```

This function is used to mint an nft to the user's address


Parameters:

| Name       | Type    | Description                                   |
| :--------- | :------ | :-------------------------------------------- |
| to         | address | the address to which an nft should be minted  |
| multiplier | uint256 | the basic rewards multiplier                  |
| duration   | uint64  | the time for which an nft can be locked       |

### changeToken (0x4ccc2757)

```solidity
function changeToken(
    uint256 tokenId,
    uint256 multiplier,
    uint64 duration
) external
```

This function is used to change the basic rewards multiplier and the time for which the current nft will be locked


Parameters:

| Name       | Type    | Description                             |
| :--------- | :------ | :-------------------------------------- |
| tokenId    | uint256 | the id of the nft to be changed         |
| multiplier | uint256 | the basic rewards multiplier            |
| duration   | uint64  | the time for which an nft can be locked |

### getCurrentMultiplier (0x0aebf7d2)

```solidity
function getCurrentMultiplier(
    address whose
) external view returns (uint256 multiplier, uint256 timeLeft)
```

This function is used to get the current basic rewards multiplier and the time for which the current nft will be locked


Parameters:

| Name  | Type    | Description                            |
| :---- | :------ | :------------------------------------- |
| whose | address | the address of the user to be checked  |


Return values:

| Name       | Type    | Description                                             |
| :--------- | :------ | :------------------------------------------------------ |
| multiplier | uint256 | the basic rewards multiplier                            |
| timeLeft   | uint256 | seconds remaining before the current locked nft expires |
