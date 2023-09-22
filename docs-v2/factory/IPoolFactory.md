# IPoolFactory

## Interface Description


License: MIT

## 

```solidity
interface IPoolFactory
```

This is the Factory contract for the gov pools. Anyone can create a pool for themselves to become
a governance owner (GovPool)
## Enums info

### VotePowerType

```solidity
enum VotePowerType {
	 LINEAR_VOTES,
	 POLYNOMIAL_VOTES,
	 CUSTOM_VOTES
}
```

The enum that holds information about calculating vote power


Parameters:

| Name             | Description                                        |
| :--------------- | :------------------------------------------------- |
| LINEAR_VOTES     | the vote power = number of tokens                  |
| POLYNOMIAL_VOTES | the vote power calculated with polynomial formula  |
| CUSTOM_VOTES     | the vote type defined by a customer                |

## Structs info

### SettingsDeployParams

```solidity
struct SettingsDeployParams {
	IGovSettings.ProposalSettings[] proposalSettings;
	address[] additionalProposalExecutors;
}
```

General settings of the pool


Parameters:

| Name                        | Type                                   | Description                                      |
| :-------------------------- | :------------------------------------- | :----------------------------------------------- |
| proposalSettings            | struct IGovSettings.ProposalSettings[] | list of infos about settings for proposal types  |
| additionalProposalExecutors | address[]                              | list of additional proposal executors            |

### ValidatorsDeployParams

```solidity
struct ValidatorsDeployParams {
	string name;
	string symbol;
	IGovValidators.ProposalSettings proposalSettings;
	address[] validators;
	uint256[] balances;
}
```

Parameters of validators


Parameters:

| Name             | Type                                   | Description                                      |
| :--------------- | :------------------------------------- | :----------------------------------------------- |
| name             | string                                 | the name of a token used by validators           |
| symbol           | string                                 | the symbol of a token used by validators         |
| proposalSettings | struct IGovValidators.ProposalSettings | struct with settings for proposals               |
| validators       | address[]                              | list of the validator addresses                  |
| balances         | uint256[]                              | list of initial token balances of the validators |

### UserKeeperDeployParams

```solidity
struct UserKeeperDeployParams {
	address tokenAddress;
	address nftAddress;
	uint256 totalPowerInTokens;
	uint256 nftsTotalSupply;
}
```

Parameters of the user keeper


Parameters:

| Name               | Type    | Description                            |
| :----------------- | :------ | :------------------------------------- |
| tokenAddress       | address | address of the tokens used for voting  |
| nftAddress         | address | address of the NFT used for voting     |
| totalPowerInTokens | uint256 | the token equivalent of all NFTs       |
| nftsTotalSupply    | uint256 | the NFT collection size                |

### TokenSaleProposalDeployParams

```solidity
struct TokenSaleProposalDeployParams {
	ITokenSaleProposal.TierInitParams[] tiersParams;
	ITokenSaleProposal.WhitelistingRequest[] whitelistParams;
	IERC20Gov.ConstructorParams tokenParams;
}
```

The token sale proposal parameters


Parameters:

| Name            | Type                                            | Description                                     |
| :-------------- | :---------------------------------------------- | :---------------------------------------------- |
| tiersParams     | struct ITokenSaleProposal.TierInitParams[]      | tiers parameters                                |
| whitelistParams | struct ITokenSaleProposal.WhitelistingRequest[] | whitelisted users (for participation in tiers)  |
| tokenParams     | struct IERC20Gov.ConstructorParams              | parameters of the token                         |

### VotePowerDeployParams

```solidity
struct VotePowerDeployParams {
	IPoolFactory.VotePowerType voteType;
	bytes initData;
	address presetAddress;
}
```

The voting power parameters


Parameters:

| Name          | Type                            | Description                                                    |
| :------------ | :------------------------------ | :------------------------------------------------------------- |
| voteType      | enum IPoolFactory.VotePowerType | type of algorythm to calculate votes number from token number  |
| initData      | bytes                           | initialization data for standard contract types                |
| presetAddress | address                         | address of custom contract (for custom voteType)               |

### GovPoolDeployParams

```solidity
struct GovPoolDeployParams {
	IPoolFactory.SettingsDeployParams settingsParams;
	IPoolFactory.ValidatorsDeployParams validatorsParams;
	IPoolFactory.UserKeeperDeployParams userKeeperParams;
	IPoolFactory.TokenSaleProposalDeployParams tokenSaleParams;
	IPoolFactory.VotePowerDeployParams votePowerParams;
	address verifier;
	bool onlyBABHolders;
	string descriptionURL;
	string name;
}
```

The pool deploy parameters


Parameters:

| Name             | Type                                              | Description                                                          |
| :--------------- | :------------------------------------------------ | :------------------------------------------------------------------- |
| settingsParams   | struct IPoolFactory.SettingsDeployParams          | general settings of the pool                                         |
| validatorsParams | struct IPoolFactory.ValidatorsDeployParams        | parameters of validators                                             |
| userKeeperParams | struct IPoolFactory.UserKeeperDeployParams        | parameters of the user keeper                                        |
| tokenSaleParams  | struct IPoolFactory.TokenSaleProposalDeployParams | the token sale proposal parameters                                   |
| votePowerParams  | struct IPoolFactory.VotePowerDeployParams         | vote power parameters                                                |
| verifier         | address                                           | the address of the verifier                                          |
| onlyBABHolders   | bool                                              | if true, only KYCed users will be allowed to interact with the pool  |
| descriptionURL   | string                                            | the description of the pool                                          |
| name             | string                                            | the name of the pool                                                 |

### GovPoolPredictedAddresses

```solidity
struct GovPoolPredictedAddresses {
	address govPool;
	address govTokenSale;
	address govToken;
	address distributionProposal;
	address expertNft;
	address nftMultiplier;
}
```


## Functions info

### deployGovPool (0xa282a9e2)

```solidity
function deployGovPool(
    IPoolFactory.GovPoolDeployParams calldata parameters
) external
```

This function is used to deploy DAO Pool with TokenSale proposal


Parameters:

| Name       | Type                                    | Description                |
| :--------- | :-------------------------------------- | :------------------------- |
| parameters | struct IPoolFactory.GovPoolDeployParams | the pool deploy parameters |

### predictGovAddresses (0x17278f74)

```solidity
function predictGovAddresses(
    address deployer,
    string calldata poolName
) external view returns (IPoolFactory.GovPoolPredictedAddresses memory)
```

The view function that predicts the addresses where
the gov pool proxy, the gov token sale proxy and the gov token will be stored


Parameters:

| Name     | Type    | Description                                     |
| :------- | :------ | :---------------------------------------------- |
| deployer | address | the user that deploys the gov pool (tx.origin)  |
| poolName | string  | the name of the pool which is part of the salt  |


Return values:

| Name | Type                                          | Description             |
| :--- | :-------------------------------------------- | :---------------------- |
| [0]  | struct IPoolFactory.GovPoolPredictedAddresses | the predicted addresses |
