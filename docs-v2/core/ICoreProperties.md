# ICoreProperties

## Interface Description


License: MIT

## 

```solidity
interface ICoreProperties
```

This is the central contract of the protocol which stores the parameters that may be modified by the DAO.
These are commissions percentages and pools parameters
## Structs info

### CoreParameters

```solidity
struct CoreParameters {
	uint128 govVotesLimit;
	uint128 govCommissionPercentage;
	uint128 tokenSaleProposalCommissionPercentage;
	uint128 micropoolVoteRewardsPercentage;
	uint128 treasuryVoteRewardsPercentage;
}
```

The struct that stores vital platform's parameters that may be modified by the OWNER
The struct that stores GovPool parameters


Parameters:

| Name                                  | Type    | Description                                             |
| :------------------------------------ | :------ | :------------------------------------------------------ |
| govVotesLimit                         | uint128 | the maximum number of simultaneous votes of the voter   |
| tokenSaleProposalCommissionPercentage | uint128 | the commission percentage for the token sale proposal   |
| micropoolVoteRewardsPercentage        | uint128 | the percentage of the rewards for the micropool voters  |
| treasuryVoteRewardsPercentage         | uint128 | the percentage of the rewards for the treasury voters   |

## Functions info

### setCoreParameters (0xc4b85e4c)

```solidity
function setCoreParameters(
    ICoreProperties.CoreParameters calldata _coreParameters
) external
```

The function to set CoreParameters


Parameters:

| Name            | Type                                  | Description    |
| :-------------- | :------------------------------------ | :------------- |
| _coreParameters | struct ICoreProperties.CoreParameters | the parameters |

### setDEXECommissionPercentages (0x7f5070fa)

```solidity
function setDEXECommissionPercentages(uint128 govCommission) external
```

The function to modify the platform's commission percentages


Parameters:

| Name          | Type    | Description                                                   |
| :------------ | :------ | :------------------------------------------------------------ |
| govCommission | uint128 | the gov percentage commission. Should be multiplied by 10**25 |

### setTokenSaleProposalCommissionPercentage (0x07914c59)

```solidity
function setTokenSaleProposalCommissionPercentage(
    uint128 tokenSaleProposalCommissionPercentage
) external
```

The function to set new token sale proposal commission percentage


Parameters:

| Name                                  | Type    | Description                   |
| :------------------------------------ | :------ | :---------------------------- |
| tokenSaleProposalCommissionPercentage | uint128 | the new commission percentage |

### setVoteRewardsPercentages (0x2bc88373)

```solidity
function setVoteRewardsPercentages(
    uint128 micropoolVoteRewardsPercentage,
    uint128 treasuryVoteRewardsPercentage
) external
```

The function to set new vote rewards percentages


Parameters:

| Name                           | Type    | Description                                             |
| :----------------------------- | :------ | :------------------------------------------------------ |
| micropoolVoteRewardsPercentage | uint128 | the percentage of the rewards for the micropool voters  |
| treasuryVoteRewardsPercentage  | uint128 | the percentage of the rewards for the treasury voters   |

### setGovVotesLimit (0xd4a4bea5)

```solidity
function setGovVotesLimit(uint128 newVotesLimit) external
```

The function to set new gov votes limit


Parameters:

| Name          | Type    | Description         |
| :------------ | :------ | :------------------ |
| newVotesLimit | uint128 | new gov votes limit |

### getDEXECommissionPercentages (0x9834ceac)

```solidity
function getDEXECommissionPercentages()
    external
    view
    returns (uint128 govPercentage, address treasuryAddress)
```

The function to get commission percentage and receiver


Return values:

| Name            | Type    | Description                            |
| :-------------- | :------ | :------------------------------------- |
| govPercentage   | uint128 | the overall gov commission percentage  |
| treasuryAddress | address | the address of the treasury commission |

### getTokenSaleProposalCommissionPercentage (0xdcce18e7)

```solidity
function getTokenSaleProposalCommissionPercentage()
    external
    view
    returns (uint128)
```

The function to get the token sale proposal commission percentage


Return values:

| Name | Type    | Description               |
| :--- | :------ | :------------------------ |
| [0]  | uint128 | the commission percentage |

### getVoteRewardsPercentages (0x43570d3a)

```solidity
function getVoteRewardsPercentages() external view returns (uint128, uint128)
```

The function to get the vote rewards percentages


Return values:

| Name | Type    | Description                                                                            |
| :--- | :------ | :------------------------------------------------------------------------------------- |
| [0]  | uint128 | micropoolVoteRewardsPercentage the percentage of the rewards for the micropool voters  |
| [1]  | uint128 | treasuryVoteRewardsPercentage the percentage of the rewards for the treasury voters    |

### getGovVotesLimit (0x47dd039f)

```solidity
function getGovVotesLimit() external view returns (uint128 votesLimit)
```

The function to get max votes limit of the gov pool


Return values:

| Name       | Type    | Description     |
| :--------- | :------ | :-------------- |
| votesLimit | uint128 | the votes limit |
