# ✋ Undelegating

Function ***`undelegate()`*** is used to return delegated tokens. User is able to take back only those tokens that are unlocked. When withdrawing the delegation, the user also receives the rewards that was earned for staking.

```solidity
function undelegate(
    address delegatee, 
    uint256 amount,
    uint256[] calldata nftIds
) external;
 ```
- ***delegatee*** - the undelegation target address (account that will be undelegated)
- ***amount*** - the **ERC20** undelegation amount
- ***nftIds*** - the array of **NFT** ids to undelegate
