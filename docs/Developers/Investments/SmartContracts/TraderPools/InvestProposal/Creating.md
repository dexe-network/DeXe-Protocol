# 🌟 Creating

###### Invest proposal creation methods

**InvestProposal** can be created on `InvestTraderPool`. A proposal is a sub-pool of the main pool, which has its own **LP** tokens and shares of investors' funds. The trader can withdraw funds from this proposal and invest them off-chain. 

Function ***`createProposal()`*** on `InvestTraderPool` is used to create investment proposals.

```solidity
function createProposal(
    string calldata descriptionURL,
    uint256 lpAmount,
    ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits,
    uint256[] calldata minPositionsOut
) external;
```
- ***descriptionURL***-  the IPFS URL of the description document
- ***lpAmount*** - the amount of LP tokens the trader will invest right away
- ***proposalLimits*** - the certain limits this proposal will have
- ***minPositionsOut*** - is an array of main pool position amounts that will be closed upon the proposal creation

The function ***`getDivestAmountsAndCommissions()`*** is used to find out the prices of tokens of open positions.

```solidity
function getDivestAmountsAndCommissions(
    address user,
    uint256 amountLP
) external returns (Receptions memory receptions, Commissions memory commissions);
```
- ***user*** -  the address of the user who is going to invest in the proposal
- ***amountLP*** - the amount of **LP** tokens the `user` is going to invest
- **returns** **->**
    - ***receptions***  - the tokens that the user will receive
    - ***commissions*** - can be ignored
