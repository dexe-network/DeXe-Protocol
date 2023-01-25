# ⚒ Executing Proposals

Once the voting has been successfully completed, the proposal can be executed.

Function ***`execute()`*** is used for executing a proposal.

```solidity
function execute(uint256 proposalId) external;
```
- ***proposalId*** - the ID of the proposal to be executed

If validators are configured in the **DAO** pool, then before executing the proposal, it should be sent to the validation stage using ***`moveProposalToValidators()`***, where the validators will decide whether to approve this offer or not (see ***Validators/Voting***).

```solidity
function moveProposalToValidators(uint256 proposalId) external;
```
- ***proposalId*** - the ID of the proposal to be sent for validation
