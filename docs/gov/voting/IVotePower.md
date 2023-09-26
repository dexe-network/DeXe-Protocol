# IVotePower

## Interface Description


License: MIT

## 

```solidity
interface IVotePower
```


## Functions info

### transformVotes (0x41cb09cc)

```solidity
function transformVotes(
    address voter,
    uint256 votes
) external view returns (uint256 resultingVotes)
```

The function for transforming token and nft power to voting power


Parameters:

| Name  | Type    | Description                    |
| :---- | :------ | :----------------------------- |
| voter | address | the voter address              |
| votes | uint256 | the total token and nft power  |


Return values:

| Name           | Type    | Description  |
| :------------- | :------ | :----------- |
| resultingVotes | uint256 | voting power |

### getVotesRatio (0xf5ca7490)

```solidity
function getVotesRatio(
    address voter
) external view returns (uint256 votesRatio)
```

The function for getting voting coefficient


Parameters:

| Name  | Type    | Description               |
| :---- | :------ | :------------------------ |
| voter | address | the address of the voter  |


Return values:

| Name       | Type    | Description                           |
| :--------- | :------ | :------------------------------------ |
| votesRatio | uint256 | the ration with 25 decimals precision |
