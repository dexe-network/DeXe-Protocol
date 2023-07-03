# 💰 Buying

⚠️⚠️ Be aware that insurance is controled by **DeXe DAO**. By the collective decision of the **DAO** can change **ANY** parameter. This may lead to users being unable to withdraw their deposits and injector may take control over the insurance pool.

To buy insurace for the deposited **DEXE** tokens user needs to call `buyInsurance()` function from `Insurance` contract. Minimal insurance is specified by the **DAO**.

❗ This function provides only an ability to lock funds. Insurance is calculated based on the amount of locked funds.

```solidity
function buyInsurance(uint256 deposit) external;
```

- ***deposit*** - the amount of DEXE tokens to be deposited

Function `getReceivedInsurance()` can display how much insurance the user will receive from the deposited tokens.

```solidity
function getReceivedInsurance(
    uint256 deposit
) public view returns (uint256);
```

- ***deposit*** - the amount of tokens to be deposited
- **returns** -> the received insurance tokens

⚠️⚠️ The insurance payout proposal is managed through **DEXE DAO** proposal creation (function ***`createProposal()`***). The community decides whether to proceed with the claim or not.
