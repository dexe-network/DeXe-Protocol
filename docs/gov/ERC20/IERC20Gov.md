# IERC20Gov

## Interface Description


License: MIT

## 

```solidity
interface IERC20Gov
```

DAO pools could issue their own ERC20 token and sell it to investors with custom sale logic
## Structs info

### ConstructorParams

```solidity
struct ConstructorParams {
	string name;
	string symbol;
	address[] users;
	uint256 cap;
	uint256 mintedTotal;
	uint256[] amounts;
}
```

Initial ERC20Gov parameters. This struct is used as an input argument in the contract constructor


Parameters:

| Name        | Type      | Description                                                              |
| :---------- | :-------- | :----------------------------------------------------------------------- |
| name        | string    | the name of the token                                                    |
| symbol      | string    | the symbol of the token                                                  |
| users       | address[] | the list of users for which tokens are needed to be minted               |
| cap         | uint256   | cap on the token's total supply                                          |
| mintedTotal | uint256   | the total amount of tokens to be minted with the contract creation       |
| amounts     | uint256[] | the list of token amounts which should be minted to the respective users |

## Functions info

### mint (0x40c10f19)

```solidity
function mint(address account, uint256 amount) external
```

This function is used to mint tokens


Parameters:

| Name    | Type    | Description                                   |
| :------ | :------ | :-------------------------------------------- |
| account | address | the address to which tokens should be minted  |
| amount  | uint256 | the token amount to be minted                 |

### pause (0x8456cb59)

```solidity
function pause() external
```

This function is used to trigger stopped contract state
### unpause (0x3f4ba83a)

```solidity
function unpause() external
```

This function is used to return default contract state
### blacklist (0xc997eb8d)

```solidity
function blacklist(address[] calldata accounts, bool value) external
```

This function is used to blacklist the addresses


Parameters:

| Name     | Type      | Description                      |
| :------- | :-------- | :------------------------------- |
| accounts | address[] | the addresses to be blacklisted  |
| value    | bool      | the blacklist status             |

### totalBlacklistAccounts (0xa33556f1)

```solidity
function totalBlacklistAccounts() external view returns (uint256)
```

This function is used to get the total amount of blacklisted accounts
### getBlacklistAccounts (0x59f017ed)

```solidity
function getBlacklistAccounts(
    uint256 offset,
    uint256 limit
) external view returns (address[] memory)
```

The paginated function to get addresses of blacklisted accounts


Parameters:

| Name   | Type    | Description                               |
| :----- | :------ | :---------------------------------------- |
| offset | uint256 | the starting index of the accounts array  |
| limit  | uint256 | the length of the array to observe        |


Return values:

| Name | Type      | Description               |
| :--- | :-------- | :------------------------ |
| [0]  | address[] | requested blacklist array |
