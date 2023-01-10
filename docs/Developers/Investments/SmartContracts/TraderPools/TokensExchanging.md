# 🔄 Tokens exchanging

There are **2** types of ***Uniswap*** token exchange methods implemented in `TraderPool` contracts: ***`swapExactTokensForTokens()`*** and ***`swapTokensForExactTokens()`***. 

The difference between these methods is that the first one tries to find the optimal path between the input and the output tokens to maximize the output amount with the given input and the second one tries to minimize the input token amount with the given output.

Function ***`exchange()`*** wraps all exchange functionality into one function. It is used to exchange tokens for other tokens.

```solidity
function exchange(
    address from,
    address to,
    uint256 amount,
    uint256 amountBound,
    address[] calldata optionalPath,
    ExchangeType exType
) public onlyTraderAdmin
```
- ***from*** - the tokens to exchange from
- ***to*** - the token to exchange to
- ***amount*** - the amount of tokens to be exchanged (normalized)
    - if ***fromExact*** **->** should equal *amountIn*
    - if ***toExact*** **->** should equal *amountOut*
- ***amountBound*** 
    - if ***fromExact*** **->** should equal *minAmountOut* (the minimal amount of `outToken` tokens that have to be received after the swap)
    - if ***toExact*** **->** should equal *maxAmountIn* ( the maximal amount of `inTokens` that have to be taken to execute the swap)
- ***optionalPath*** - the optional path between from and to tokens used by the pathfinder
- ***exType*** - exchange type. Can be exchangeFromExact (`FROM_EXACT`) or exchangeToExact (`TO_EXACT`)

```solidity
enum ExchangeType {
    FROM_EXACT,
    TO_EXACT
}
```


### exchangeFromExact & exchangeToExact

Function ***`exchangeFromExact()`*** on `PriceFeed` wraps the ***`swapExactTokensForTokens()`*** functionality. 

Function ***`exchangeToExact()`*** on `PriceFeed` wraps the ***`swapTokensForExactTokens()`*** functionality. 

More details about these functions in *PriceFeed/Exchanging* 
