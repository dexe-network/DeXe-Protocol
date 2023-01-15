# 🤝 Managing

###### Functions to manage an InvestProposal

Function ***`withdraw()`*** on `TraderPoolInvestProposal` allows trader to withdraw the invested funds to his wallet.

```solidity
function withdraw(uint256 proposalId, uint256 amount) external;
```
- ***proposalId*** - the id of the proposal to withdraw the funds from
- ***amount*** the amount of base tokens to withdraw (normalized)

#
Function ***`supply()`*** on `TraderPoolInvestProposal` is used to supply reward to the investors.

```solidity
function supply(
    uint256 proposalId,
    uint256[] calldata amounts,
    address[] calldata addresses
) external;
```
- ***proposalId*** - the id of the proposal to supply the funds to
- ***amounts*** - the amounts of tokens to be supplied (normalized)
- ***addresses*** - the addresses of tokens to be supplied

#
Function ***`convertInvestedBaseToDividends()`*** on `TraderPoolInvestProposal` allows the trader (and admins) to convert invested funds into dividends.

```solidity
function convertInvestedBaseToDividends(uint256 proposalId) external;
```
- ***proposalId*** - the id of the proposal