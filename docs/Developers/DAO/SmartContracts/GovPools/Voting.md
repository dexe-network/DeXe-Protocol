# 🗳 Voting

**DAO** pool members can vote on existing proposals with their own tokens or with delegated tokens.

#

Function ***`vote()`*** is used for voting with own tokens.

```solidity
function vote(
    uint256 proposalId,
    uint256 depositAmount,
    uint256[] calldata depositNftIds,
    uint256 voteAmount,
    uint256[] calldata voteNftIds
) external;
```

- ***proposalId*** - the id of proposal
- ***depositAmount*** - the deposit amount in ERC20
    - may be **0** if tokens were already deposited
- ***depositNftIds*** - the deposit **NFT** ids
    - may be **0** if tokens were already deposited
- ***voteAmount*** - the **ERC20** vote amount
- ***voteNftIds*** - the **NFT** ids that will be used in voting

❗ Values `voteAmount`, `voteNftIds` should be less or equal to the total deposit.

#

Function ***`voteDelegated()`*** is used for voting with delegated tokens.

```solidity
function voteDelegated(
    uint256 proposalId,
    uint256 voteAmount,
    uint256[] calldata voteNftIds
) external;
```

- ***proposalId*** - the id of proposal
- ***voteAmount*** - the **ERC20** vote amount
- ***voteNftIds*** - the **NFT** ids that will be used in delegated voting