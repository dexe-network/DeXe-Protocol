# IGovValidatorsToken

## Interface Description


License: MIT

## 

```solidity
interface IGovValidatorsToken is IERC20
```

This is the contract that determines the validators
## Functions info

### mint (0x40c10f19)

```solidity
function mint(address account, uint256 amount) external
```

Mint new tokens, available only from `Validators` contract


Parameters:

| Name    | Type    | Description               |
| :------ | :------ | :------------------------ |
| account | address | Address                   |
| amount  | uint256 | Token amount to mint. Wei |

### burn (0x9dc29fac)

```solidity
function burn(address account, uint256 amount) external
```

Burn tokens, available only from `Validators` contract


Parameters:

| Name    | Type    | Description               |
| :------ | :------ | :------------------------ |
| account | address | Address                   |
| amount  | uint256 | Token amount to burn. Wei |

### snapshot (0x9711715a)

```solidity
function snapshot() external returns (uint256)
```

Create tokens snapshot


Return values:

| Name | Type    | Description |
| :--- | :------ | :---------- |
| [0]  | uint256 | Snapshot ID |
