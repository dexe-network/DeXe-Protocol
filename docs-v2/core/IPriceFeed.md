# IPriceFeed

## Interface Description


License: MIT

## 

```solidity
interface IPriceFeed
```

This is the price feed contract which is used to fetch the spot prices from the UniswapV2 protocol + execute swaps
on its pairs. The protocol does not require price oracles to be secure and reliable. There also is a pathfinder
built into the contract to find the optimal* path between the pairs
## Structs info

### FoundPath

```solidity
struct FoundPath {
	address[] path;
	uint256[] amounts;
	bool withProvidedPath;
}
```

A struct this is returned from the UniswapV2PathFinder library when an optimal* path is found


Parameters:

| Name             | Type      | Description                                                    |
| :--------------- | :-------- | :------------------------------------------------------------- |
| path             | address[] | the optimal* path itself                                       |
| amounts          | uint256[] | either the "amounts out" or "amounts in" required              |
| withProvidedPath | bool      | a bool flag saying if the path is found via the specified path |

## Functions info

### addPathTokens (0xf973dc01)

```solidity
function addPathTokens(address[] calldata pathTokens) external
```

This function sets path tokens that will be used in the pathfinder


Parameters:

| Name       | Type      | Description                                          |
| :--------- | :-------- | :--------------------------------------------------- |
| pathTokens | address[] | the array of tokens to be added into the path finder |

### removePathTokens (0x5de49e39)

```solidity
function removePathTokens(address[] calldata pathTokens) external
```

This function removes path tokens from the pathfinder


Parameters:

| Name       | Type      | Description                                           |
| :--------- | :-------- | :---------------------------------------------------- |
| pathTokens | address[] | the array of tokens to be removed from the pathfinder |

### exchangeFromExact (0xe6e1a063)

```solidity
function exchangeFromExact(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] calldata optionalPath,
    uint256 minAmountOut
) external returns (uint256)
```

The function that performs an actual Uniswap swap (swapExactTokensForTokens),
taking the amountIn inToken tokens from the msg.sender and sending not less than minAmountOut outTokens back.
The approval of amountIn tokens has to be made to this address beforehand


Parameters:

| Name         | Type      | Description                                                                                                                              |
| :----------- | :-------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| inToken      | address   | the token to be exchanged from                                                                                                           |
| outToken     | address   | the token to be exchanged to                                                                                                             |
| amountIn     | uint256   | the amount of inToken tokens to be exchanged                                                                                             |
| optionalPath | address[] | the optional path that will be considered by the pathfinder to find the best route                                                       |
| minAmountOut | uint256   | the minimal amount of outToken tokens that have to be received after the swap. basically this is a sandwich attack protection mechanism  |


Return values:

| Name | Type    | Description                                                         |
| :--- | :------ | :------------------------------------------------------------------ |
| [0]  | uint256 | the amount of outToken tokens sent to the msg.sender after the swap |

### exchangeToExact (0xcbe374df)

```solidity
function exchangeToExact(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] calldata optionalPath,
    uint256 maxAmountIn
) external returns (uint256)
```

The function that performs an actual Uniswap swap (swapTokensForExactTokens),
taking not more than maxAmountIn inToken tokens from the msg.sender and sending amountOut outTokens back.
The approval of maxAmountIn tokens has to be made to this address beforehand


Parameters:

| Name         | Type      | Description                                                                                                                         |
| :----------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| inToken      | address   | the token to be exchanged from                                                                                                      |
| outToken     | address   | the token to be exchanged to                                                                                                        |
| amountOut    | uint256   | the amount of outToken tokens to be received                                                                                        |
| optionalPath | address[] | the optional path that will be considered by the pathfinder to find the best route                                                  |
| maxAmountIn  | uint256   | the maximal amount of inTokens that have to be taken to execute the swap. basically this is a sandwich attack protection mechanism  |


Return values:

| Name | Type    | Description                                      |
| :--- | :------ | :----------------------------------------------- |
| [0]  | uint256 | the amount of inTokens taken from the msg.sender |

### normalizedExchangeFromExact (0x1dbe97d2)

```solidity
function normalizedExchangeFromExact(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] calldata optionalPath,
    uint256 minAmountOut
) external returns (uint256)
```

The same as "exchangeFromExact" except that the amount of inTokens and received amount of outTokens is normalized


Parameters:

| Name         | Type      | Description                                                       |
| :----------- | :-------- | :---------------------------------------------------------------- |
| inToken      | address   | the token to be exchanged from                                    |
| outToken     | address   | the token to be exchanged to                                      |
| amountIn     | uint256   | the amount of inTokens to be exchanged (in 18 decimals)           |
| optionalPath | address[] | the optional path that will be considered by the pathfinder       |
| minAmountOut | uint256   | the minimal amount of outTokens to be received (also normalized)  |


Return values:

| Name | Type    | Description                                                          |
| :--- | :------ | :------------------------------------------------------------------- |
| [0]  | uint256 | normalized amount of outTokens sent to the msg.sender after the swap |

### normalizedExchangeToExact (0x953fdbca)

```solidity
function normalizedExchangeToExact(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] calldata optionalPath,
    uint256 maxAmountIn
) external returns (uint256)
```

The same as "exchangeToExact" except that the amount of inTokens and received amount of outTokens is normalized


Parameters:

| Name         | Type      | Description                                                   |
| :----------- | :-------- | :------------------------------------------------------------ |
| inToken      | address   | the token to be exchanged from                                |
| outToken     | address   | the token to be exchanged to                                  |
| amountOut    | uint256   | the amount of outTokens to be received (in 18 decimals)       |
| optionalPath | address[] | the optional path that will be considered by the pathfinder   |
| maxAmountIn  | uint256   | the maximal amount of inTokens to be taken (also normalized)  |


Return values:

| Name | Type    | Description                                                                 |
| :--- | :------ | :-------------------------------------------------------------------------- |
| [0]  | uint256 | normalized amount of inTokens taken from the msg.sender to execute the swap |

### getExtendedPriceOut (0xdd10bb7a)

```solidity
function getExtendedPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] memory optionalPath
) external view returns (uint256 amountOut, address[] memory path)
```

This function tries to find the optimal exchange rate (the price) between "inToken" and "outToken" using
custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of
outTokens is maximal


Parameters:

| Name         | Type      | Description                                                                         |
| :----------- | :-------- | :---------------------------------------------------------------------------------- |
| inToken      | address   | the token to exchange from                                                          |
| outToken     | address   | the received token                                                                  |
| amountIn     | uint256   | the amount of inToken to be exchanged (in inToken decimals)                         |
| optionalPath | address[] | the optional path between inToken and outToken that will be used in the pathfinder  |


Return values:

| Name      | Type      | Description                                               |
| :-------- | :-------- | :-------------------------------------------------------- |
| amountOut | uint256   | amount of outToken after the swap (in outToken decimals)  |
| path      | address[] | the tokens path that will be used during the swap         |

### getExtendedPriceIn (0xf862cfa7)

```solidity
function getExtendedPriceIn(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] memory optionalPath
) external view returns (uint256 amountIn, address[] memory path)
```

This function tries to find the optimal exchange rate (the price) between "inToken" and "outToken" using
custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of
inTokens is minimal


Parameters:

| Name         | Type      | Description                                                                         |
| :----------- | :-------- | :---------------------------------------------------------------------------------- |
| inToken      | address   | the token to exchange from                                                          |
| outToken     | address   | the received token                                                                  |
| amountOut    | uint256   | the amount of outToken to be received (in inToken decimals)                         |
| optionalPath | address[] | the optional path between inToken and outToken that will be used in the pathfinder  |


Return values:

| Name     | Type      | Description                                                 |
| :------- | :-------- | :---------------------------------------------------------- |
| amountIn | uint256   | amount of inToken to execute a swap (in outToken decimals)  |
| path     | address[] | the tokens path that will be used during the swap           |

### getNormalizedPriceOut (0xb6ccb44d)

```solidity
function getNormalizedPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn
) external view returns (uint256 amountOut, address[] memory path)
```

Shares the same functionality as "getExtendedPriceOut" function with automatic usage of saved paths.
It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals


Parameters:

| Name     | Type    | Description                                               |
| :------- | :------ | :-------------------------------------------------------- |
| inToken  | address | the token to exchange from                                |
| outToken | address | the token to exchange to                                  |
| amountIn | uint256 | the amount of inToken to be exchanged (with 18 decimals)  |


Return values:

| Name      | Type      | Description                                                        |
| :-------- | :-------- | :----------------------------------------------------------------- |
| amountOut | uint256   | the received amount of outToken after the swap (with 18 decimals)  |
| path      | address[] | the tokens path that will be used during the swap                  |

### getNormalizedPriceIn (0x2bcbc598)

```solidity
function getNormalizedPriceIn(
    address inToken,
    address outToken,
    uint256 amountOut
) external view returns (uint256 amountIn, address[] memory path)
```

Shares the same functionality as "getExtendedPriceIn" function with automatic usage of saved paths.
It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals


Parameters:

| Name      | Type    | Description                                               |
| :-------- | :------ | :-------------------------------------------------------- |
| inToken   | address | the token to exchange from                                |
| outToken  | address | the token to exchange to                                  |
| amountOut | uint256 | the amount of outToken to be received (with 18 decimals)  |


Return values:

| Name     | Type      | Description                                                        |
| :------- | :-------- | :----------------------------------------------------------------- |
| amountIn | uint256   | required amount of inToken to execute the swap (with 18 decimals)  |
| path     | address[] | the tokens path that will be used during the swap                  |

### getNormalizedExtendedPriceOut (0x93008762)

```solidity
function getNormalizedExtendedPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn,
    address[] memory optionalPath
) external view returns (uint256 amountOut, address[] memory path)
```

Shares the same functionality as "getExtendedPriceOut" function.
It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals


Parameters:

| Name         | Type      | Description                                                                         |
| :----------- | :-------- | :---------------------------------------------------------------------------------- |
| inToken      | address   | the token to exchange from                                                          |
| outToken     | address   | the token to exchange to                                                            |
| amountIn     | uint256   | the amount of inToken to be exchanged (with 18 decimals)                            |
| optionalPath | address[] | the optional path between inToken and outToken that will be used in the pathfinder  |


Return values:

| Name      | Type      | Description                                                        |
| :-------- | :-------- | :----------------------------------------------------------------- |
| amountOut | uint256   | the received amount of outToken after the swap (with 18 decimals)  |
| path      | address[] | the tokens path that will be used during the swap                  |

### getNormalizedExtendedPriceIn (0x09481569)

```solidity
function getNormalizedExtendedPriceIn(
    address inToken,
    address outToken,
    uint256 amountOut,
    address[] memory optionalPath
) external view returns (uint256 amountIn, address[] memory path)
```

Shares the same functionality as "getExtendedPriceIn" function.
It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals


Parameters:

| Name         | Type      | Description                                                                         |
| :----------- | :-------- | :---------------------------------------------------------------------------------- |
| inToken      | address   | the token to exchange from                                                          |
| outToken     | address   | the token to exchange to                                                            |
| amountOut    | uint256   | the amount of outToken to be received (with 18 decimals)                            |
| optionalPath | address[] | the optional path between inToken and outToken that will be used in the pathfinder  |


Return values:

| Name     | Type      | Description                                                            |
| :------- | :-------- | :--------------------------------------------------------------------- |
| amountIn | uint256   | the required amount of inToken to execute the swap (with 18 decimals)  |
| path     | address[] | the tokens path that will be used during the swap                      |

### getNormalizedPriceOutUSD (0xb4c05b8c)

```solidity
function getNormalizedPriceOutUSD(
    address inToken,
    uint256 amountIn
) external view returns (uint256 amountOut, address[] memory path)
```

The same as "getPriceOut" with "outToken" being native USD token


Parameters:

| Name     | Type    | Description                                           |
| :------- | :------ | :---------------------------------------------------- |
| inToken  | address | the token to be exchanged from                        |
| amountIn | uint256 | the amount of inToken to exchange (with 18 decimals)  |


Return values:

| Name      | Type      | Description                                                                 |
| :-------- | :-------- | :-------------------------------------------------------------------------- |
| amountOut | uint256   | the received amount of native USD tokens after the swap (with 18 decimals)  |
| path      | address[] | the tokens path that will be used during the swap                           |

### getNormalizedPriceInUSD (0x715c6baf)

```solidity
function getNormalizedPriceInUSD(
    address inToken,
    uint256 amountOut
) external view returns (uint256 amountIn, address[] memory path)
```

The same as "getPriceIn" with "outToken" being USD token


Parameters:

| Name      | Type    | Description                                          |
| :-------- | :------ | :--------------------------------------------------- |
| inToken   | address | the token to get the price of                        |
| amountOut | uint256 | the amount of USD to be received (with 18 decimals)  |


Return values:

| Name     | Type      | Description                                                            |
| :------- | :-------- | :--------------------------------------------------------------------- |
| amountIn | uint256   | the required amount of inToken to execute the swap (with 18 decimals)  |
| path     | address[] | the tokens path that will be used during the swap                      |

### getNormalizedPriceOutDEXE (0x291bcd52)

```solidity
function getNormalizedPriceOutDEXE(
    address inToken,
    uint256 amountIn
) external view returns (uint256 amountOut, address[] memory path)
```

The same as "getPriceOut" with "outToken" being DEXE token


Parameters:

| Name     | Type    | Description                                           |
| :------- | :------ | :---------------------------------------------------- |
| inToken  | address | the token to be exchanged from                        |
| amountIn | uint256 | the amount of inToken to exchange (with 18 decimals)  |


Return values:

| Name      | Type      | Description                                                           |
| :-------- | :-------- | :-------------------------------------------------------------------- |
| amountOut | uint256   | the received amount of DEXE tokens after the swap (with 18 decimals)  |
| path      | address[] | the tokens path that will be used during the swap                     |

### getNormalizedPriceInDEXE (0x9180f690)

```solidity
function getNormalizedPriceInDEXE(
    address inToken,
    uint256 amountOut
) external view returns (uint256 amountIn, address[] memory path)
```

The same as "getPriceIn" with "outToken" being DEXE token


Parameters:

| Name      | Type    | Description                                           |
| :-------- | :------ | :---------------------------------------------------- |
| inToken   | address | the token to get the price of                         |
| amountOut | uint256 | the amount of DEXE to be received (with 18 decimals)  |


Return values:

| Name     | Type      | Description                                                            |
| :------- | :-------- | :--------------------------------------------------------------------- |
| amountIn | uint256   | the required amount of inToken to execute the swap (with 18 decimals)  |
| path     | address[] | the tokens path that will be used during the swap                      |

### totalPathTokens (0x9f2f8ce1)

```solidity
function totalPathTokens() external view returns (uint256)
```

The function that returns the total number of path tokens (tokens used in the pathfinder)


Return values:

| Name | Type    | Description               |
| :--- | :------ | :------------------------ |
| [0]  | uint256 | the number of path tokens |

### getPathTokens (0x547c176b)

```solidity
function getPathTokens() external view returns (address[] memory)
```

The function to get the list of path tokens


Return values:

| Name | Type      | Description             |
| :--- | :-------- | :---------------------- |
| [0]  | address[] | the list of path tokens |

### getSavedPaths (0x9ef94808)

```solidity
function getSavedPaths(
    address pool,
    address from,
    address to
) external view returns (address[] memory)
```

The function to get the list of saved tokens of the pool


Parameters:

| Name | Type    | Description                        |
| :--- | :------ | :--------------------------------- |
| pool | address | the address the path is saved for  |
| from | address | the from token (path beginning)    |
| to   | address | the to token (path ending)         |


Return values:

| Name | Type      | Description                                                           |
| :--- | :-------- | :-------------------------------------------------------------------- |
| [0]  | address[] | the array of addresses representing the inclusive path between tokens |

### isSupportedPathToken (0xa5b0de41)

```solidity
function isSupportedPathToken(address token) external view returns (bool)
```

This function checks if the provided token is used by the pathfinder


Parameters:

| Name  | Type    | Description              |
| :---- | :------ | :----------------------- |
| token | address | the token to be checked  |


Return values:

| Name | Type | Description                                                  |
| :--- | :--- | :----------------------------------------------------------- |
| [0]  | bool | true if the token is used by the pathfinder, false otherwise |
