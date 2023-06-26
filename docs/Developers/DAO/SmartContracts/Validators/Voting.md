# 🗳 Voting

Validators in the **DAO** pool may be needed in order to validate incoming proposals after they have been confirmed by the community. Validators are chosen by the community by assigning them special non-trasferable tokens.

The validator contract is like a **DAO** pool where validators vote for ***external*** proposals (which came from the **DAO** pool using the ***`moveProposalToValidators()`*** method, see ***GovPools/ExecutingProposals***) and for ***internal*** ones.

Function ***`vote()`*** on `GovValidators` is used by validators for voting.

```solidity
function vote(
    uint256 proposalId,
    uint256 amount, 
    bool isInternal,
    bool isVoteFor
) external;
```

- ***proposalId*** - proposal ID (***internal*** or ***external***)
- ***amount*** - amount of tokens to vote
- ***isInternal*** -
  - `true` **->** vote in ***internal*** proposal
  - `false` **->** vote in ***external*** proposal
- ***isVoteFor*** -
  - `true` **->** vote ***for*** the proposal
  - `false` **->** vote ***against*** the proposal
