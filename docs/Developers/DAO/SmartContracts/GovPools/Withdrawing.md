# 💸 Withdrawing

Function ***`withdraw()`*** is used to withdraw *owned* deposited tokens from pool.

```solidity
function withdraw(
    address receiver,
    uint256 amount,
    uint256[] calldata nftIds
) external;
```

- ***receiver*** - the withdrawal receiver address
- ***amount*** - the **ERC20** withdrawal amount
- ***nftIds*** - the array of **NFT** ids to withdraw

❗ For a successful withdrawal of tokens, all voting in which the user participated must be completed.