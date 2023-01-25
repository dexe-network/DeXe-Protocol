# 💡 Creating proposal

*Proposal* - intention of the pool **DAO** to do something. After its creation, users will have to vote for its adoption according to the rules specified in the voting settings (duration, quorum, validators...).

#
Function ***`createProposal()`*** on `GovPool` is used to create proposals.
```solidity
function createProposal(
    string calldata descriptionURL,
    string calldata misc,
    address[] memory executors,
    uint256[] calldata values,
    bytes[] calldata data
) external;
```
- ***descriptionURL*** - *IPFS* URL to the proposal's description
- ***misc*** - special string that will be saved on the subgraph
- ***executors*** - executors addresses
- ***values*** - the ether values
- ***data*** - data Bytes
