# IGovSettings

## Interface Description


License: MIT

## 

```solidity
interface IGovSettings
```

This is the contract that stores proposal settings that will be used by the governance pool
## Enums info

### ExecutorType

```solidity
enum ExecutorType {
	 DEFAULT,
	 INTERNAL,
	 VALIDATORS
}
```


## Structs info

### ProposalSettings

```solidity
struct ProposalSettings {
	bool earlyCompletion;
	bool delegatedVotingAllowed;
	bool validatorsVote;
	uint64 duration;
	uint64 durationValidators;
	uint64 executionDelay;
	uint128 quorum;
	uint128 quorumValidators;
	uint256 minVotesForVoting;
	uint256 minVotesForCreating;
	IGovSettings.RewardsInfo rewardsInfo;
	string executorDescription;
}
```

The struct holds information about settings for proposal type


Parameters:

| Name                   | Type                            | Description                                                                                                      |
| :--------------------- | :------------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| earlyCompletion        | bool                            | the boolean flag, if true the voting completes as soon as the quorum is reached                                  |
| delegatedVotingAllowed | bool                            | the boolean flag, if true then delegators can vote with their own delegated tokens, else micropool vote allowed  |
| validatorsVote         | bool                            | the boolean flag, if true then voting will have an additional validators step                                    |
| duration               | uint64                          | the duration of voting in seconds                                                                                |
| durationValidators     | uint64                          | the duration of validators voting in seconds                                                                     |
| executionDelay         | uint64                          | the delay in seconds before the proposal can be executed                                                         |
| quorum                 | uint128                         | the percentage of total votes supply (erc20 + nft) to confirm the proposal                                       |
| quorumValidators       | uint128                         | the percentage of total validator token supply to confirm the proposal                                           |
| minVotesForVoting      | uint256                         | the minimal needed voting power to vote for the proposal                                                         |
| minVotesForCreating    | uint256                         | the minimal needed voting power to create the proposal                                                           |
| rewardsInfo            | struct IGovSettings.RewardsInfo | the reward info for proposal creation and execution                                                              |
| executorDescription    | string                          | the settings description string                                                                                  |

### RewardsInfo

```solidity
struct RewardsInfo {
	address rewardToken;
	uint256 creationReward;
	uint256 executionReward;
	uint256 voteRewardsCoefficient;
}
```

The struct holds information about rewards for proposals


Parameters:

| Name                   | Type    | Description                                       |
| :--------------------- | :------ | :------------------------------------------------ |
| rewardToken            | address | the reward token address                          |
| creationReward         | uint256 | the amount of reward for proposal creation        |
| executionReward        | uint256 | the amount of reward for proposal execution       |
| voteRewardsCoefficient | uint256 | the reward multiplier for voting for the proposal |

## Functions info

### executorToSettings (0x793e1468)

```solidity
function executorToSettings(address executor) external view returns (uint256)
```

The function to get settings of this executor


Parameters:

| Name     | Type    | Description   |
| :------- | :------ | :------------ |
| executor | address | the executor  |


Return values:

| Name | Type    | Description                |
| :--- | :------ | :------------------------- |
| [0]  | uint256 | setting id of the executor |

### addSettings (0x6a11e769)

```solidity
function addSettings(
    IGovSettings.ProposalSettings[] calldata _settings
) external
```

Add new types to contract


Parameters:

| Name      | Type                                   | Description  |
| :-------- | :------------------------------------- | :----------- |
| _settings | struct IGovSettings.ProposalSettings[] | New settings |

### editSettings (0x2d141cdd)

```solidity
function editSettings(
    uint256[] calldata settingsIds,
    IGovSettings.ProposalSettings[] calldata _settings
) external
```

Edit existed type


Parameters:

| Name        | Type                                   | Description           |
| :---------- | :------------------------------------- | :-------------------- |
| settingsIds | uint256[]                              | Existed settings IDs  |
| _settings   | struct IGovSettings.ProposalSettings[] | New settings          |

### changeExecutors (0xf7e1ef01)

```solidity
function changeExecutors(
    address[] calldata executors,
    uint256[] calldata settingsIds
) external
```

Change executors association


Parameters:

| Name        | Type      | Description |
| :---------- | :-------- | :---------- |
| executors   | address[] | Addresses   |
| settingsIds | uint256[] | New types   |

### getDefaultSettings (0x00d04976)

```solidity
function getDefaultSettings()
    external
    view
    returns (IGovSettings.ProposalSettings memory)
```

The function to get default settings


Return values:

| Name | Type                                 | Description     |
| :--- | :----------------------------------- | :-------------- |
| [0]  | struct IGovSettings.ProposalSettings | default setting |

### getInternalSettings (0x79dcff40)

```solidity
function getInternalSettings()
    external
    view
    returns (IGovSettings.ProposalSettings memory)
```

The function to get internal settings


Return values:

| Name | Type                                 | Description      |
| :--- | :----------------------------------- | :--------------- |
| [0]  | struct IGovSettings.ProposalSettings | internal setting |

### getExecutorSettings (0x57404769)

```solidity
function getExecutorSettings(
    address executor
) external view returns (IGovSettings.ProposalSettings memory)
```

The function the get the settings of the executor


Parameters:

| Name     | Type    | Description       |
| :------- | :------ | :---------------- |
| executor | address | Executor address  |


Return values:

| Name | Type                                 | Description                              |
| :--- | :----------------------------------- | :--------------------------------------- |
| [0]  | struct IGovSettings.ProposalSettings | `ProposalSettings` by `executor` address |
