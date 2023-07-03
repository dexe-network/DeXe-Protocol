# PriceFeed

## ⛕ PathTokens

Function ***`addPathTokens()`*** sets path tokens that will be used in the pathfinder.

```solidity
function addPathTokens(address[] calldata pathTokens) external onlyOwner;
```

- ***pathTokens*** - the array of tokens to be added into the path finder

#

Function ***`removePathTokens()`*** removes path tokens from the pathfinder.

```solidity
function removePathTokens(address[] calldata pathTokens) external onlyOwner;
```

- ***pathTokens*** - the array of tokens to be added into the path finder
