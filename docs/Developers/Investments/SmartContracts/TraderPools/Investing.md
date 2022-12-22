# 💵Investing

❗ Before investing in a pool, you need to make sure that the investor has sufficient allowance on the underlying token of this pool.

To invest in a pool, use the ***`invest()`*** function on `TraderPool`.

`TraderPool` is an abstract class, so ***`invest()`*** function is also implemented in `BasicTraderPool` and `InvestTraderPool`.

```solidity
function invest(
    uint256 amountInBaseToInvest,
    uint256[] calldata minPositionsOut
) public;
```

- ***amountInBaseToInvest*** - the amount of base tokens to be invested
- ***minPositionsOut*** - minimal active portfolio positions amounts that will be received

#### Getting minPositionsOut parameter 

To get the `prices` of all open positions in the base token ahead of time (to calculate the active portfolio slippage for the decentralized exchange), the ***`getInvestTokens()`*** function has to be called.

`minPositionsOut[]` = `(1 - slippage) * prices[]`

The interface of ***`getInvestTokens()`*** is as follows:
```solidity
function getInvestTokens(
    uint256 amountInBaseToInvest
) external returns (Receptions memory receptions);
```
- ***amountInBaseToInvest*** - the amount of base tokens to be invested
- **returns** **->** information about the rewards in `Receptions` structure

#### Receptions

The struct that is returned from the `TraderPoolView` contract to see the received amounts.

```solidity
struct Receptions {
    uint256 baseAmount;
    uint256 lpAmount;
    address[] positions;
    uint256[] givenAmounts;
    uint256[] receivedAmounts;
}
```
- ***baseAmount*** - the amount of base token that will be invested as is
- ***lpAmount*** - total received LP token amount (zero in ***`getDivestAmountsAndCommissions()`***)
- ***positions*** - the addresses of positions tokens from which the receivedAmounts are calculated
- ***givenAmounts*** - the amounts in base token that will be traded for the position tokens 
- ***receivedAmounts*** - the amounts in position tokens received after the trade