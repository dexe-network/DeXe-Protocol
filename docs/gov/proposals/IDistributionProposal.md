# IDistributionProposal

## Interface Description


License: MIT

## 

```solidity
interface IDistributionProposal
```

This is the contract the governance can execute in order to distribute rewards proportionally among
all the voters who participated in the certain proposal
## Structs info

### DPInfo

```solidity
struct DPInfo {
	address rewardAddress;
	uint256 rewardAmount;
	mapping(address => bool) claimed;
}
```

The struct holds information about distribution proposal


Parameters:

| Name          | Type                     | Description                                                      |
| :------------ | :----------------------- | :--------------------------------------------------------------- |
| rewardAddress | address                  | the address of reward token                                      |
| rewardAmount  | uint256                  | the total amount of rewards                                      |
| claimed       | mapping(address => bool) | mapping, that indicates whether the user has claimed the rewards |

## Functions info

### execute (0xc45e0ae6)

```solidity
function execute(
    uint256 proposalId,
    address token,
    uint256 amount
) external payable
```

Executed by `Gov` contract, creates a DP


Parameters:

| Name       | Type    | Description                                  |
| :--------- | :------ | :------------------------------------------- |
| proposalId | uint256 | the id of distribution proposal in Gov pool  |
| token      | address | the rewards token address                    |
| amount     | uint256 | the total amount of rewards                  |

### claim (0x45718278)

```solidity
function claim(address voter, uint256[] calldata proposalIds) external
```

Claims distribution proposal rewards


Parameters:

| Name        | Type      | Description               |
| :---------- | :-------- | :------------------------ |
| voter       | address   | Voter address             |
| proposalIds | uint256[] | the array of proposal ids |

### isClaimed (0xd2ef0795)

```solidity
function isClaimed(
    uint256 proposalId,
    address voter
) external view returns (bool)
```

Function to check if voter claimed their reward


Parameters:

| Name       | Type    | Description                   |
| :--------- | :------ | :---------------------------- |
| proposalId | uint256 | the distribution proposal id  |
| voter      | address | the user to check             |


Return values:

| Name | Type | Description               |
| :--- | :--- | :------------------------ |
| [0]  | bool | true if reward is claimed |

### getPotentialReward (0xfe32b0ba)

```solidity
function getPotentialReward(
    uint256 proposalId,
    address voter
) external view returns (uint256)
```

Return potential reward. If user hasn't voted, or `getTotalVotesWeight` is zero, return zero


Parameters:

| Name       | Type    | Description      |
| :--------- | :------ | :--------------- |
| proposalId | uint256 | the proposal id  |
| voter      | address | Voter address    |
