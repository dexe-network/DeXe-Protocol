# 🗳️ Modifying

###### Function to modify an InvestProposal

Function ***`changeProposalRestrictions()`*** is used for proposal modification. This function can be used to open/close proposals.

```solidity
function changeProposalRestrictions(
    uint256 proposalId,
    ProposalLimits calldata proposalLimits
) external onlyTraderAdmin;
```

- ***proposalId*** - the id of the proposal to change
- ***proposalLimits*** - the new limits for this proposal in form of `ProposalLimits`

```solidity
struct ProposalLimits {
    uint256 timestampLimit;
    uint256 investLPLimit;
}
```
- ***timestampLimit*** - the timestamp after which the proposal will close for the investments
- ***investLPLimit*** - the maximal invested amount of **LP** tokens after which the proposal will close
