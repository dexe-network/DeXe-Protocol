# 🗳 Voting

**DAO** pool members can vote on existing proposals with their own tokens. All the delegated tokens will be automatically added.

#

Function ***`vote()`*** is used for voting with own tokens.

```solidity
function vote(
    uint256 proposalId,
    bool isVoteFor,
    uint256 voteAmount,
    uint256[] calldata voteNftIds
) external onlyBABTHolder;
```

- ***proposalId*** - the id of the proposal
- ***isVoteFor*** - `true` if the vote is for the proposal, `false` if against
- ***voteAmount*** - the **ERC20** vote amount
- ***voteNftIds*** - the **NFT** ids that will be used in voting

❗ Values `voteAmount`, `voteNftIds` should be less or equal to the total deposit.

#

Function ***`cancel()`*** is used for canceling the vote.

```solidity
function cancelVote(uint256 proposalId) external;
```

- ***proposalId*** - the id of the proposal
