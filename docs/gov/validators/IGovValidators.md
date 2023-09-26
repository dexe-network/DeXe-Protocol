# IGovValidators

## Interface Description


License: MIT

## 

```solidity
interface IGovValidators
```

This is the voting contract that is queried on the proposal's second voting stage
## Enums info

### ProposalState

```solidity
enum ProposalState {
	 Voting,
	 Defeated,
	 Succeeded,
	 Locked,
	 Executed,
	 Undefined
}
```


### ProposalType

```solidity
enum ProposalType {
	 ChangeSettings,
	 ChangeBalances,
	 MonthlyWithdraw,
	 OffchainProposal
}
```


## Structs info

### ProposalSettings

```solidity
struct ProposalSettings {
	uint64 duration;
	uint64 executionDelay;
	uint128 quorum;
}
```

The struct holds information about settings for validators proposal


Parameters:

| Name           | Type    | Description                                                       |
| :------------- | :------ | :---------------------------------------------------------------- |
| duration       | uint64  | the duration of voting                                            |
| executionDelay | uint64  | the delay in seconds after voting end                             |
| quorum         | uint128 | the percentage of validators token supply to confirm the proposal |

### ProposalCore

```solidity
struct ProposalCore {
	bool executed;
	uint56 snapshotId;
	uint64 voteEnd;
	uint64 executeAfter;
	uint128 quorum;
	uint256 votesFor;
	uint256 votesAgainst;
}
```

The struct holds core properties of a proposal


Parameters:

| Name         | Type    | Description                                                              |
| :----------- | :------ | :----------------------------------------------------------------------- |
| executed     | bool    | the boolean flag that indicates whether the proposal is executed or not  |
| snapshotId   | uint56  | the id of snapshot                                                       |
| voteEnd      | uint64  | the timestamp of voting end of the proposal                              |
| executeAfter | uint64  | the timestamp of execution in seconds after voting end                   |
| quorum       | uint128 | the percentage of validators token supply to confirm the proposal        |
| votesFor     | uint256 | the total number of votes in proposal from all voters                    |
| votesAgainst | uint256 | the total number of votes against proposal from all voters               |

### InternalProposal

```solidity
struct InternalProposal {
	IGovValidators.ProposalType proposalType;
	IGovValidators.ProposalCore core;
	string descriptionURL;
	bytes data;
}
```

The struct holds information about the internal proposal


Parameters:

| Name           | Type                               | Description                                                              |
| :------------- | :--------------------------------- | :----------------------------------------------------------------------- |
| proposalType   | enum IGovValidators.ProposalType   | the `ProposalType` enum                                                  |
| core           | struct IGovValidators.ProposalCore | the struct that holds information about core properties of the proposal  |
| descriptionURL | string                             | the string with link to IPFS doc with proposal description               |
| data           | bytes                              | the data to be executed                                                  |

### ExternalProposal

```solidity
struct ExternalProposal {
	IGovValidators.ProposalCore core;
}
```

The struct holds information about the external proposal


Parameters:

| Name | Type                               | Description                                                           |
| :--- | :--------------------------------- | :-------------------------------------------------------------------- |
| core | struct IGovValidators.ProposalCore | the struct that holds information about core properties of a proposal |

### InternalProposalView

```solidity
struct InternalProposalView {
	IGovValidators.InternalProposal proposal;
	IGovValidators.ProposalState proposalState;
	uint256 requiredQuorum;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name           | Type                                   | Description                                                       |
| :------------- | :------------------------------------- | :---------------------------------------------------------------- |
| proposal       | struct IGovValidators.InternalProposal | the `InternalProposal` struct                                     |
| proposalState  | enum IGovValidators.ProposalState      | the `ProposalState` enum                                          |
| requiredQuorum | uint256                                | the percentage of validators token supply to confirm the proposal |

## Functions info

### validatorsCount (0xed612f8c)

```solidity
function validatorsCount() external view returns (uint256)
```

The function for getting current number of validators


Return values:

| Name | Type    | Description            |
| :--- | :------ | :--------------------- |
| [0]  | uint256 | `number` of validators |

### createInternalProposal (0x9661803d)

```solidity
function createInternalProposal(
    IGovValidators.ProposalType proposalType,
    string calldata descriptionURL,
    bytes calldata data
) external
```

Create internal proposal for changing validators balances, base quorum, base duration


Parameters:

| Name         | Type                             | Description                                                                                                                                                                                                               |
| :----------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| proposalType | enum IGovValidators.ProposalType | `ProposalType` 0 - `ChangeInternalDurationAndQuorum`, change base duration and quorum 1 - `ChangeBalances`, change address balance 2 - `MonthlyWithdraw`, monthly token withdraw 3 - `OffchainProposal`, offchain action  |
| data         | bytes                            | New packed data, depending on proposal type                                                                                                                                                                               |

### createExternalProposal (0xdc2a7714)

```solidity
function createExternalProposal(
    uint256 proposalId,
    IGovValidators.ProposalSettings calldata proposalSettings
) external
```

Create external proposal. This function can call only `Gov` contract


Parameters:

| Name             | Type                                   | Description                      |
| :--------------- | :------------------------------------- | :------------------------------- |
| proposalId       | uint256                                | Proposal ID from `Gov` contract  |
| proposalSettings | struct IGovValidators.ProposalSettings | `ProposalSettings` struct        |

### voteInternalProposal (0x5a34c7e1)

```solidity
function voteInternalProposal(
    uint256 proposalId,
    uint256 amount,
    bool isVoteFor
) external
```


### voteExternalProposal (0xba877b80)

```solidity
function voteExternalProposal(
    uint256 proposalId,
    uint256 amount,
    bool isVoteFor
) external
```


### cancelVoteInternalProposal (0x5478197e)

```solidity
function cancelVoteInternalProposal(uint256 proposalId) external
```


### cancelVoteExternalProposal (0xea1941d0)

```solidity
function cancelVoteExternalProposal(uint256 proposalId) external
```


### executeInternalProposal (0x65f3f23f)

```solidity
function executeInternalProposal(uint256 proposalId) external
```

Only for internal proposals. External proposals should be executed from governance.


Parameters:

| Name       | Type    | Description          |
| :--------- | :------ | :------------------- |
| proposalId | uint256 | Internal proposal ID |

### executeExternalProposal (0x430c885a)

```solidity
function executeExternalProposal(uint256 proposalId) external
```

The function called by governance that marks the external proposal as executed


Parameters:

| Name       | Type    | Description          |
| :--------- | :------ | :------------------- |
| proposalId | uint256 | External proposal ID |

### changeSettings (0xb395fec0)

```solidity
function changeSettings(
    uint64 duration,
    uint64 executionDelay,
    uint128 quorum
) external
```


### changeBalances (0x62a4107d)

```solidity
function changeBalances(
    uint256[] calldata newValues,
    address[] calldata userAddresses
) external
```

The function for changing validators balances


Parameters:

| Name          | Type      | Description                    |
| :------------ | :-------- | :----------------------------- |
| newValues     | uint256[] | the array of new balances      |
| userAddresses | address[] | the array validators addresses |

### monthlyWithdraw (0x3271f009)

```solidity
function monthlyWithdraw(
    address[] calldata tokens,
    uint256[] calldata amounts,
    address destination
) external
```


### getExternalProposal (0xe14ea231)

```solidity
function getExternalProposal(
    uint256 index
) external view returns (IGovValidators.ExternalProposal memory)
```

The function for getting information about the external proposals


Parameters:

| Name  | Type    | Description            |
| :---- | :------ | :--------------------- |
| index | uint256 | the index of proposal  |


Return values:

| Name | Type                                   | Description               |
| :--- | :------------------------------------- | :------------------------ |
| [0]  | struct IGovValidators.ExternalProposal | `ExternalProposal` struct |

### getInternalProposals (0x8a847ae4)

```solidity
function getInternalProposals(
    uint256 offset,
    uint256 limit
) external view returns (IGovValidators.InternalProposalView[] memory)
```

The function for getting information about internal proposals


Parameters:

| Name   | Type    | Description                           |
| :----- | :------ | :------------------------------------ |
| offset | uint256 | the starting proposal index           |
| limit  | uint256 | the length of the observed proposals  |


Return values:

| Name | Type                                         | Description                         |
| :--- | :------------------------------------------- | :---------------------------------- |
| [0]  | struct IGovValidators.InternalProposalView[] | `InternalProposalView` struct array |

### getProposalState (0x7b839d93)

```solidity
function getProposalState(
    uint256 proposalId,
    bool isInternal
) external view returns (IGovValidators.ProposalState)
```

Return proposal state

Options:
`Voting` - proposal where addresses can vote.
`Defeated` - proposal where voting time is over and proposal defeated.
`Succeeded` - proposal with the required number of votes.
`Executed` - executed proposal (only for internal proposal).
`Undefined` - nonexistent proposal.
### getProposalRequiredQuorum (0xbd7782fc)

```solidity
function getProposalRequiredQuorum(
    uint256 proposalId,
    bool isInternal
) external view returns (uint256)
```

The function for getting proposal required quorum


Parameters:

| Name       | Type    | Description                                          |
| :--------- | :------ | :--------------------------------------------------- |
| proposalId | uint256 | the id of proposal                                   |
| isInternal | bool    | the boolean flag, if true then proposal is internal  |


Return values:

| Name | Type    | Description                             |
| :--- | :------ | :-------------------------------------- |
| [0]  | uint256 | the number of votes to reach the quorum |

### isValidator (0xfacd743b)

```solidity
function isValidator(address user) external view returns (bool)
```

The function that checks if a user is a validator


Parameters:

| Name | Type    | Description            |
| :--- | :------ | :--------------------- |
| user | address | the address of a user  |


Return values:

| Name | Type | Description                               |
| :--- | :--- | :---------------------------------------- |
| [0]  | bool | `flag`, if true, than user is a validator |
