# 💰 Investing

###### Risky proposal investing methods

To invest into a proposal, user needs to call the ***`investProposal()`*** function on the `BasicTraderPool`

```solidity
function investProposal(
    uint256 proposalId,
    uint256 lpAmount,
    uint256[] calldata minDivestOut,
    uint256 minProposalOut
) external;
```
- ***proposalId*** - the id of the proposal a user would like to invest to 
- ***lpAmount*** - the amount of **LP** tokens to invest into the proposal 
- ***minDivestOut*** - is an array of main pool position amounts that will be closed upon the proposal investment
- ***minProposalOut*** - the minimal amount of proposal tokens to receive

Function ***`getDivestAmountsAndCommissions()`*** on `TraderPool` is used to receive the amount of tokens when closing positions.

```solidity
function getDivestAmountsAndCommissions(
    address user,
    uint256 amountLP
) external returns (Receptions memory receptions, Commissions memory commissions);
```
- ***user*** - the address of the user who is going to invest into the proposal
- ***amountLP*** - the amount of LP tokens the user is going to invest
- **returns** **->**
    - ***receptions***  - the tokens that the user will receive
    - ***commissions*** - can be ignored

Function ***`getInvestTokens()`*** on `TraderPoolRiskyProposal` is used to get the amount of base tokens and position tokens received on this proposal investment.

```solidity
function getInvestTokens(
    uint256 proposalId,
    uint256 baseInvestment
) external returns (
    uint256 baseAmount,
    uint256 positionAmount, 
    uint256 lp2Amount
);
```
- ***proposalId*** - the id of the proposal to invest in
- ***baseInvestment*** - the amount of base tokens to be invested (normalized)
- **returns** ->
    - ***baseAmount*** -  the received amount of base tokens (normalized) 
    - ***positionAmount*** - the received amount of position tokens (normalized) 
    - ***lp2Amount*** - the amount of **LP2** tokens received