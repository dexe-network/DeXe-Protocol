# 💰 Investing

###### InvestProposal investing methods

All investors can invest in a proposal.
Function ***`getDivestAmountsAndCommissions()`*** is used to get ***minPositionsOut***  parameter in ***`investProposal()`***.

```solidity
function getDivestAmountsAndCommissions(
    address user,
    uint256 amountLP
) external returns (Receptions memory receptions, Commissions memory commissions);
```

- ***user*** -  the address of the user who is going to invent in the proposal
- ***amountLP*** - the amount of LP tokens the user is going to invest
- **returns** **->**
    - ***receptions***  - the tokens that the user will receive
    - ***commissions*** - can be ignored

Function ***`investProposal()`*** is used to invest in a proposal. Contrary to the `RiskyProposal` there is no percentage-wise investment limit.

```solidity
function investProposal(
    uint256 proposalId,
    uint256 lpAmount,
    uint256[] calldata minPositionsOut
) external;
```
- ***proposalId*** - the id of the proposal to invest in
- ***lpAmount*** - to amount of lpTokens to be invested into the proposal
- ***minPositionsOut*** - is an array of main pool position amounts that will be closed upon the proposal invest