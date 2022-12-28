# ✍️ Delegating

If a user doesn't want to vote for proposals, he can give part of his funds to another user to manage and receive rewards.

Function `delegate()` is used for this purpose.
```solidity
function delegate(
    address delegatee, 
    uint256 amount, 
    uint256[] calldata nftIds
) external;
```
- ***delegatee*** - the target address for delegation (account that will receive the delegation)
- ***amount*** - the **ERC20** delegation amount
- ***nftIds*** - the array of **NFT** ids to delegate