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

### exchangeFromExact

Function ***`exchangeFromExact()`*** on PriceFeed wraps the ***`swapExactTokensForTokens()`*** functionality. It performs an actual **Uniswap** swap, taking the ***amountIn*** tokens `inToken` from the `msg.sender` and sending not less than ***minAmountOut*** tokens `outToken` back.

***minAmountOut*** serves as a sandwich attack protection mechanism. Function ***`getExchangeFromExactAmount()`*** is used to get this parameter. You also need to consider `slippage`:

`minAmountOut` = ⌊ `getExchangeFromExactAmount` * (*100%* - `slippage`) ⌋

### exchangeToExact

Function ***`exchangeToExact()`*** on `PriceFeed` wraps the ***`swapTokensForExactTokens()`*** functionality. It performs an actual **Uniswap** swap, taking not more than ***maxAmountIn*** tokens `inToken` from the `msg.sender` and sending ***amountOut*** tokens `outToken` back. The approval of ***maxAmountIn*** tokens has to be made to this address beforehand.

```solidity
function exchangeToExact(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] calldata optionalPath,
    uint256 maxAmountIn
) external returns (uint256);
```
- ***inToken*** - the token to be exchanged from
- ***outToken*** - the token to be exchanged to
- ***amountOut*** - the amount of outToken tokens to be exchanged
- ***optionalPath*** - the optional path that will be considered by the pathfinder to find the best route
- ***maxAmountIn*** - the maximal amount of `inTokens` that have to be taken to execute the swap
- **returns** **->** the amount of `inTokens`  taken from the `msg.sender`

***maxAmountIn*** serves as a sandwich attack protection mechanism. Function ***`getExchangeToExactAmount()`*** is used to get this parameter. You also need to consider `slippage`:

`maxAmountIn` = ⌈ `getExchangeToExactAmount` * (*100%* + `slippage`) ⌉
