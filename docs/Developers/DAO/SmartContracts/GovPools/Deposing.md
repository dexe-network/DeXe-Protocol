# 💰 Depositing

To be able to vote on proposals, user must first deposit funds into the **DAO** pool.

Function ***`deposit()`*** is used for this purpose.

```solidity
function deposit(
    address receiver, 
    uint256 amount, 
    uint256[] calldata nftIds
) external;
```
- ***receiver*** - the address of the deposit receiver
- ***amount*** - the **ERC20** deposit amount
- ***nftIds*** - the array of **NFT** ids to deposit
