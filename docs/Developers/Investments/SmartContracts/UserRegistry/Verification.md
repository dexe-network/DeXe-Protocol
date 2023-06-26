# 🆔 Verification

Binance Account Bound token (**BABT**) is used to verify users. Some protocol features may not be available without obtaining a verification token.

Function ***`isBABTHolder()`*** in `TraderPool` checks whether the specified address is a **BABT** holder.

```solidity
function isBABTHolder(address who) public view returns (bool);
```

Function ***`getTraderBABTId()`*** in `TraderPool` is used to get trader's **BAB** token id.

```solidity
function getTraderBABTId() external view returns (uint256);
```
