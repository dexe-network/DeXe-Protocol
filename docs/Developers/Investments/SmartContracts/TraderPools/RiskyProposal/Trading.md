# 💱 Trading

Function ***`exchange()`*** on `TraderPoolRiskyProposal`  is used to exchange tokens for tokens in the specified proposal.

```solidity
function exchange(
    uint256 proposalId,
    address from,
    uint256 amount,
    uint256 amountBound,
    address[] calldata optionalPath,
    ExchangeType exType
) external;
```

- ***proposalId*** - the proposal to exchange tokens in
- ***from*** - the tokens to exchange from
- ***amount*** - the amount of tokens to be exchanged (normalized)
    - if **fromExact** **->** should equal *amountIn*
    - if **toExact** **->** should equal *amountOut*
- ***amountBound*** 
    - if **fromExact** -> should equal *minAmountOut* (the minimal amount of `outToken` tokens that have to be received after the swap)
    - if **toExact** -> should equal *maxAmountIn* (the maximal amount of `inTokens` that have to be taken to execute the swap)
- ***optionalPath*** - the optional path between from and to tokens used by the pathfinder
- ***exType*** - exchange type. Can be ***exchangeFromExact*** (`FROM_EXACT`) or ***exchangeToExact*** (`TO_EXACT`)

```solidity
enum ExchangeType {
    FROM_EXACT,
    TO_EXACT
}
```
More details about the exchange types on the `🔄 Tokens exchanging` page.