# PriceFeed 
## 🔄 Exchanging

### exchangeFromExact

Function ***`exchangeFromExact()`*** on PriceFeed wraps the ***`swapExactTokensForTokens()`*** functionality. It performs an actual **Uniswap** swap, taking the ***amountIn*** tokens `inToken` from the `msg.sender` and sending not less than ***minAmountOut*** tokens `outToken` back.

```solidity
function exchangeFromExact(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] memory optionalPath,
    uint256 minAmountOut
) external returns (uint256) 
```
- ***inToken*** - the token to be exchanged from
- ***outToken*** - the token to be exchanged to
- ***amountIn*** - the amount of `inToken` tokens to be exchanged
- ***optionalPath*** - the optional path that will be considered by the pathfinder to find the best route
- ***minAmountOut*** - the minimal amount of `outToken` tokens that have to be received after the swap
- **returns** **->** the amount of `outToken` tokens sent to the `msg.sender` after the swap

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
