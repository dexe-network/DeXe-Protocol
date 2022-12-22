# 💰 Buying

To buy insurace for the deposited **DEXE** tokens user needs to call `buyInsurance()` function from `Insurance` contract. Minimal insurance is specified by the **DAO**.

```solidity
function buyInsurance(uint256 deposit) external;
```

- ***deposit*** - the amount of DEXE tokens to be deposited

Function `getReceivedInsurance()` can display how much insurance the user will receive from the deposited tokens.

```solidity
function getReceivedInsurance(
        uint256 deposit
    ) external returns (uint256);
```

- ***deposit*** - the amount of tokens to be deposited
- **returns** -> the received insurance tokens