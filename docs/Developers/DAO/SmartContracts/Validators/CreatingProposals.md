# 💡 Creating Proposals

Internal proposals is used for changing validators balances, base quorum, base duration. To create this type of proposal function  ***`createInternalProposal()`*** is used.

```solidity
function createInternalProposal(
    ProposalType proposalType,
    string calldata descriptionURL,
    uint256[] calldata newValues,
    address[] calldata userAddresses
) external;
```
- ***proposalType*** -  type of the proposal
- ***descriptionURL*** - **IPFS** URL to the proposal's description
- ***newValues*** -  new values (tokens amounts array, quorum or duration or both)
- ***userAddresses*** -  validators addresses
    - set it if `proposalType` is `ChangeBalances`

```solidity
enum ProposalType {
    ChangeInternalDuration,
    ChangeInternalQuorum,
    ChangeInternalDurationAndQuorum,
    ChangeBalances
}
```

⚠️⚠️ The owner of validators contract is the corresponding **DAO**. The community can control its validators and **CHANGE** them by using `ChangeBalances` type of a proposal.