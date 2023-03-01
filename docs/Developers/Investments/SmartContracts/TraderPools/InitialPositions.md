# 💳 Initial Positions

If the trader already has some tokens, he can use the function of creating a pool with the initial positions.

Function ***`investInitial()`*** is used to invest initial positions into the pool. Bypasses the active portfolio.

```solidity
function investInitial(
    uint256[] calldata amounts,
    address[] calldata tokens
) external;
```

❗ The function will only work if there are no investors in the pool. The tokens will be taken from the trader's wallet.

- ***amounts*** - the normalized amounts of tokens to be invested
- ***tokens*** - the array of tokens to be invested (if not a base token -> opens a position)

Function ***`getInvestInitialTokens()`*** is used to get the lp amount that will be given to the investor.

```solidity
function getInvestInitialTokens(
    address[] calldata tokens,
    uint256[] calldata amounts
) external view returns (uint256 lpAmount);
```

- ***tokens*** - the array of token addresses
- ***amounts*** - the array of token amounts
- **returns** **->** the amount of lp token

The calculation of the number of **LP** tokens that will be minted is relative to the spot price position to the base token.