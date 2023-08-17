# 💡 Creating proposal

*Proposal* - intention of the pool **DAO** to do something. After its creation, users will have to vote for its adoption according to the rules specified in the voting settings (duration, quorum, validators...).

#

Function ***`createProposal()`*** on `GovPool` is used to create proposals.

```solidity
function createProposal(
    string calldata descriptionURL,
    ProposalAction[] calldata actionsOnFor,
    ProposalAction[] calldata actionsOnAgainst
) external onlyBABTHolder;
```

- ***descriptionURL*** - *IPFS* URL to the proposal's description
- ***actionsOnFor*** - actions that will be executed if the proposal is accepted
- ***actionsOnAgainst*** - actions that will be executed if the proposal is rejected

Structure in the parameters:

#

```solidity
struct ProposalAction {
    address executor;
    uint256 value;
    bytes data;
}
```

`ProposalAction` struct holds information about actions on the proposal

- ***executor*** - the address of the executor
- ***value*** - the ether value
- ***data*** - the data Bytes
