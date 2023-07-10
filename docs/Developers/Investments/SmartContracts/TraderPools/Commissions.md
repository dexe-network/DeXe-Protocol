# 💰 Commissions

The overall commission consists of trader and platform commissions.

The platform takes a commission in **DEXE** tokens, so we need to know the price of the **DEXE** token in order to correctly calculate the slippage.

To obtain information about the commission of the platform and the trader, the function `getReinvestCommissions()` is used. After that, in order to take the commission, the function `reinvestCommission()` should be called.

### getReinvestCommissions()

The function that returns the received commissions from the users when the `reinvestCommission()` function is called.

```solidity
function getReinvestCommissions(
    uint256[] calldata offsetLimits
) external view returns (Commissions memory commissions);
```
- ***offsetLimits*** - the starting indexes and the lengths of the investors array
    - ***starting indexes*** **->** *even positions*
    - ***lengths*** **->** *odd*
- **returns** **->** the received commission info (struct `Commissions` was described on the `Withdrawing💸` page)

### reinvestCommission()

The function that takes the commission from the users' income. This function should be called once per the commission period.

```solidity
function reinvestCommission(
    uint256[] calldata offsetLimits
) external virtual onlyTraderAdmin onlyBABTHolder;
```
- ***offsetLimits*** - the array of starting indexes and the lengths of the investors array

❗ Function can be called only when there are no open positions.