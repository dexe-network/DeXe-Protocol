# IProposalValidator

## Interface Description


License: MIT

## 

```solidity
interface IProposalValidator
```

The hook contract that proposals may inherit in order to implement extra validation
## Functions info

### validate (0x4216fc04)

```solidity
function validate(
    IGovPool.ProposalAction[] calldata actions
) external view returns (bool valid)
```

The hook function


Parameters:

| Name    | Type                             | Description                 |
| :------ | :------------------------------- | :-------------------------- |
| actions | struct IGovPool.ProposalAction[] | the proposal "for" actions  |


Return values:

| Name  | Type | Description                                                         |
| :---- | :--- | :------------------------------------------------------------------ |
| valid | bool | "true" if everything is ok, "false" to revert the proposal creation |
