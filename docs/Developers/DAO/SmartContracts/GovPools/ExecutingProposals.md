# ⚒ Executing Proposals

Once the voting has been successfully completed, the proposal can be executed.

Function ***`execute()`*** is used for executing a proposal.

```solidity
function execute(uint256 proposalId) external;
```
- ***proposalId*** - the ID of the proposal to be executed

If validators are configured in the **DAO** pool, then before executing the proposal, it should be send to the validation stage using ***`moveProposalToValidators()`***, where the validators on their contract, will decide whether to validate this offer (see ***Validators/Voting***).

```solidity
function moveProposalToValidators(uint256 proposalId) external;
```
- ***proposalId*** - the ID of the proposal to be send for validation