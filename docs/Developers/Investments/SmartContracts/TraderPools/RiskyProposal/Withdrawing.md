# 💸 Withdrawing

###### Risky proposal withdrawal methods

Funds from risky proposals can be withdrawn only to the main pool. Tokens that cannot be withdrawn back to the main pool will be transfered back to investors` wallets.

Function ***`reinvestProposal()`*** on `BasicTraderPool` is used to withdraw funds. This function divests from the proposal and puts the funds back to the main pool.

```solidity
function reinvestProposal(
    uint256 proposalId,
    uint256 lp2Amount,
    uint256[] calldata minInvestsOut,
    uint256 minBaseOut
) external onlyBABTHolder;
```

- ***proposalId*** - the id of the proposal to divest from
- ***lp2Amount*** - the amount of proposal **LP** tokens to be divested
- ***minInvestsOut*** - the minimal amounts of main pool positions tokens to be received
- ***minBaseOut*** - the minimal amount of **base** tokens received on a proposal divest

To get the closing price of a position function ***`getDivestAmounts()`*** on `TraderPoolRiskyProposal` is used.

```solidity
function getDivestAmounts(
    uint256[] calldata proposalIds,
    uint256[] calldata lp2s
) external view returns (Receptions memory receptions);
```

- ***proposalIds*** - the ids of the proposals to divest from
- ***lp2s*** - the amounts of proposals **LPs** to be divested
- **returns** **->**
  - ***receptions*** - the information about the received tokens

Function ***`getInvestTokens()`*** on `TraderPool` is used to get the amounts of positions tokens that will be given to the investor upon the proposal divest.

```solidity
function getInvestTokens(
    uint256 amountInBaseToInvest
) external view returns (Receptions memory receptions);
```

- ***amountInBaseToInvest*** - normalized amount of base tokens to be invested
- **returns** **->**
  - ***receptions*** - the information about the received tokens
