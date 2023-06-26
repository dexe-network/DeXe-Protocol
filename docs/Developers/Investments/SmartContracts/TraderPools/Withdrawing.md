# 💸 Withdrawing

Withdrawal of funds from the pool is available to investors at any time.

A trader can withdraw tokens only if there are no open positions in the pool.

Function ***`divest()`*** is responsible for withdrawing funds from the pool. Due to the active portfolio, this function additionally swaps the open positions tokens to the base token. It also calculates the commission of the investor who withdraws the funds.

The platform takes the commission in **DEXE** tokens, so data about **DEXE** price has to be provided. 
- ***amountLP*** - withdrawal amount of TraderPool LP tokens 
- ***minPositionsOut*** - minimal active portfolio positions that will be withdrawn
- ***minDexeCommissionsOut*** - minimal commission of **DeXe** platform

To get ***minPositionsOut*** and  ***minDexeCommissionsOut***  parameters function ***`getDivestAmountsAndCommissions()`*** is used:

```solidity
function getDivestAmountsAndCommissions(
    address user,
    uint256 amountLP
) external view returns (Receptions memory receptions, Commissions memory commissions);
```
- ***user*** - address of the user who is withdrawing tokens
- ***amountLP*** - the amount of LP tokens requested for withdrawal
- **returns** **->**  minimal positions amounts that can be withdrawn (in the form of `Receptions` structure) and commissions (in the form of `Commissions` structure)

### Receptions

The struct that stores information about values of corresponding token addresses.

```solidity
struct Receptions {
    uint256 baseAmount;
    uint256 lpAmount;
    address[] positions;
    uint256[] givenAmounts;
    uint256[] receivedAmounts;
}
```

- ***baseAmount*** - total received base token amount after the withdrawal
- ***lpAmount*** - will be zero
- ***positions*** - the addresses of positions tokens from which the `receivedAmounts` are calculated
- ***givenAmounts*** - the amounts of position tokens that will be traded to base tokens
- ***receivedAmounts*** - the amounts of base tokens that will be received after the trades

### Comissions

The struct that is returned from the `TraderPoolView` contract to see the taken commissions.

```solidity
struct Commissions {
    uint256 traderBaseCommission;
    uint256 traderLPCommission;
    uint256 traderUSDCommission;
    uint256 dexeBaseCommission;
    uint256 dexeLPCommission;
    uint256 dexeUSDCommission;
    uint256 dexeDexeCommission;
}
```
- ***traderBaseCommission*** - the total trader's commission in **base** tokens (normalized)
- ***traderLPCommission*** - the equivalent trader's commission in **LP** tokens
- ***traderUSDCommission*** - the equivalent trader's commission in **USD** (normalized)
- ***dexeBaseCommission*** - the total platform's commission in **base** tokens (normalized)
- ***dexeLPCommission*** - the equivalent platform's commission in **LP** tokens
- ***dexeUSDCommission*** - the equivalent platform's commission in **USD** (normalized)
- ***dexeDexeCommission*** - the equivalent platform's commission in **DEXE** tokens (normalized)
