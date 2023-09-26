# IPriceFeed

## Interface Description


License: MIT

## 

```solidity
interface IPriceFeed
```

This is the price feed contract which is used to fetch the spot prices from the UniswapV2 protocol. There also is a pathfinder
built into the contract to find the optimal* path between the pairs
## Structs info

### FoundPath

```solidity
struct FoundPath {
	address[] path;
	uint256[] amounts;
}
```

A struct this is returned from the UniswapV2PathFinder library when an optimal* path is found


Parameters:

| Name    | Type      | Description                                       |
| :------ | :-------- | :------------------------------------------------ |
| path    | address[] | the optimal* path itself                          |
| amounts | uint256[] | either the "amounts out" or "amounts in" required |

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

### getPriceOut (0x70e48e96)

```solidity
function getPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn
) external view returns (uint256 amountOut, address[] memory path)
```

Shares the same functionality as "getExtendedPriceOut" function with an empty optionalPath.
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

### getPriceIn (0xd48c3202)

```solidity
function getPriceIn(
    address inToken,
    address outToken,
    uint256 amountOut
) external view returns (uint256 amountIn, address[] memory path)
```

Shares the same functionality as "getExtendedPriceIn" function with with an empty optionalPath.
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
custom pathfinder and optional specified path. The optimality is reached when the amount of
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
custom pathfinder and optional specified path. The optimality is reached when the amount of
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

### getNormalizedPriceOut (0xb6ccb44d)

```solidity
function getNormalizedPriceOut(
    address inToken,
    address outToken,
    uint256 amountIn
) external view returns (uint256 amountOut, address[] memory path)
```

Shares the same functionality as "getExtendedPriceOut" function with an empty optionalPath.
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

Shares the same functionality as "getExtendedPriceIn" function with an empty optionalPath.
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
