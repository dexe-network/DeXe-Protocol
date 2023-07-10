# 💸 Withdrawing

###### Invest proposal withdrawal methods

Function ***`reinvestProposal()`*** withdraws earnings from a specific proposal and reinvests it back into the main pool.

1) Call the function ***`getRewards()`*** on `TraderPoolInvestProposal`. The function is used to get user's rewards from the proposals.

```solidity
function getRewards(
    uint256[] calldata proposalIds,
    address user
) external view returns (Receptions memory receptions);
```

- ***proposalIds*** - the array of proposals ids
- ***user*** - the address of the user to get rewards of
- **returns** **->** the information about the received rewards

2) Call ***`getInvestTokens()`*** on `InvestTraderPool`. The function used to get the amounts of positions tokens that will be given to the investor on the investment.

```solidity
function getInvestTokens(
    uint256 amountInBaseToInvest
) external returns (Receptions memory receptions);
```

- ***amountInBaseToInvest*** - normalized amount of base tokens to be invested
- **returns** **->** the information about the tokens received

3) Call ***`reinvestProposal()`*** on `InvestTraderPool`. This function invests all the profit from the proposal into this pool.

```solidity
function reinvestProposal(
    uint256 proposalId, 
    uint256[] calldata minPositionsOut
) external onlyBABTHolder;
```

- ***proposalId*** - the id of the proposal to take the profit from
- ***minPositionsOut*** - the amounts of position tokens received on investment
