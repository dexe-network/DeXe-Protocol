# ✨ Distribution Proposal

This is the contract the governance can execute in order to distribute rewards proportionally among all the voters who participated in the certain proposal.

#

Function ***`claim()`*** is used for claiming distribution proposal rewards.

```solidity
function claim(address voter, uint256[] calldata proposalIds) external;
```

- ***voter*** - the address of the voter
- ***proposalIds*** - the array of proposal ids

#

Function ***`getPotentialReward()`*** is used to get potential reward of the user for participation in voting.

```solidity
function getPotentialReward(
    uint256 proposalId,
    address voter
) public view returns (uint256);
```

- ***proposalId*** - the proposal id
- ***voter*** - the address of the voter
