# 💱 Price Quoting

Function ***`getExtendedPriceIn()`*** on `PriceFeed` tries to find the optimal exchange rate (the price) between `inToken` and `outToken` using custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of `inTokens` is minimal.

```solidity
function getExtendedPriceIn(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] memory optionalPath
) public view virtual returns (uint256 amountIn, address[] memory path);
```

- ***inToken*** - the token to exchange from
- ***outToken*** - the received token
- ***amountOut*** - the amount of `outToken` to be received (in `inToken` decimals)
- ***optionalPath*** - the optional path between `inToken` and `outToken` that will be used in the pathfinder
- **returns** **->**
  - **amountIn** - amount of `inToken` to execute a swap (in `outToken` decimals)
  - **path** - the tokens path that will be used during the swap

#

Function ***`getExtendedPriceOut()`*** on `PriceFeed` tries to find the optimal exchange rate (the price) between `inToken` and `outToken` using custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of `outTokens` is maximal.

```solidity
function getExtendedPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] memory optionalPath
) public view virtual returns (uint256 amountOut, address[] memory path);
```

- ***inToken*** - the token to exchange from
- ***outToken*** - the received token
- ***amountIn*** - the amount of `inToken` to be exchanged (in `inToken` decimals)
- ***optionalPath*** - the optional path between `inToken` and `outToken` that will be used in the pathfinder
- **returns** **->**
  - **amountOut** - amount of `outToken` after the swap (in `outToken` decimals)
  - **path** - the tokens path that will be used during the swap
