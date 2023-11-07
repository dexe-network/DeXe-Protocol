# ISBT721

## Interface Description


License: MIT

## 

```solidity
interface ISBT721
```


## Events info

### Attest

```solidity
event Attest(address indexed to, uint256 indexed tokenId)
```

This emits when a new token is created and bound to an account by
any mechanism.
Note: For a reliable `to` parameter, retrieve the transaction's
authenticated `to` field.
### Revoke

```solidity
event Revoke(address indexed from, uint256 indexed tokenId)
```

This emits when an existing SBT is revoked from an account and
destroyed by any mechanism.
Note: For a reliable `from` parameter, retrieve the transaction's
authenticated `from` field.
### Burn

```solidity
event Burn(address indexed from, uint256 indexed tokenId)
```

This emits when an existing SBT is burned by an account
### Transfer

```solidity
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
```

Emitted when `tokenId` token is transferred from `from` to `to`.
## Functions info

### attest (0xeb31403f)

```solidity
function attest(address to) external returns (uint256)
```

Mints SBT

Requirements:

- `to` must be valid.
- `to` must not exist.

Emits a {Attest} event.
Emits a {Transfer} event.


Return values:

| Name | Type    | Description                   |
| :--- | :------ | :---------------------------- |
| [0]  | uint256 | The tokenId of the minted SBT |

### revoke (0x74a8f103)

```solidity
function revoke(address from) external
```

Revokes SBT

Requirements:

- `from` must exist.

Emits a {Revoke} event.
Emits a {Transfer} event.
### burn (0x44df8e70)

```solidity
function burn() external
```

At any time, an SBT receiver must be able to
disassociate themselves from an SBT publicly through calling this
function.

Emits a {Burn} event.
Emits a {Transfer} event.
### balanceOf (0x70a08231)

```solidity
function balanceOf(address owner) external view returns (uint256)
```

Count all SBTs assigned to an owner

SBTs assigned to the zero address is considered invalid, and this
function throws for queries about the zero address.


Parameters:

| Name  | Type    | Description                               |
| :---- | :------ | :---------------------------------------- |
| owner | address | An address for whom to query the balance  |


Return values:

| Name | Type    | Description                                        |
| :--- | :------ | :------------------------------------------------- |
| [0]  | uint256 | The number of SBTs owned by `owner`, possibly zero |

### tokenIdOf (0x773c02d4)

```solidity
function tokenIdOf(address from) external view returns (uint256)
```



Parameters:

| Name | Type    | Description                   |
| :--- | :------ | :---------------------------- |
| from | address | The address of the SBT owner  |


Return values:

| Name | Type    | Description                                                                                        |
| :--- | :------ | :------------------------------------------------------------------------------------------------- |
| [0]  | uint256 | The tokenId of the owner's SBT, and throw an error if there is no SBT belongs to the given address |

### ownerOf (0x6352211e)

```solidity
function ownerOf(uint256 tokenId) external view returns (address)
```

Find the address bound to a SBT

SBTs assigned to zero address are considered invalid, and queries
about them do throw.


Parameters:

| Name    | Type    | Description                |
| :------ | :------ | :------------------------- |
| tokenId | uint256 | The identifier for an SBT  |


Return values:

| Name | Type    | Description                               |
| :--- | :------ | :---------------------------------------- |
| [0]  | address | The address of the owner bound to the SBT |

### totalSupply (0x18160ddd)

```solidity
function totalSupply() external view returns (uint256)
```

Returns the amount of tokens in existence.