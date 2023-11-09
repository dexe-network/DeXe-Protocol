# IERC721Expert

## Interface Description


License: MIT

## 

```solidity
interface IERC721Expert is IERC721Upgradeable
```

The ERC721 token that implements experts functionality, follows EIP-5484
## Enums info

### BurnAuth

```solidity
enum BurnAuth {
	 IssuerOnly,
	 OwnerOnly,
	 Both,
	 Neither
}
```


## Events info

### Issued

```solidity
event Issued(address indexed from, address indexed to, uint256 indexed tokenId, IERC721Expert.BurnAuth burnAuth)
```

Emitted when a soulbound token is issued.


Parameters:

| Name     | Type                        | Description                 |
| :------- | :-------------------------- | :-------------------------- |
| from     | address                     | The issuer                  |
| to       | address                     | The receiver                |
| tokenId  | uint256                     | The id of the issued token  |
| burnAuth | enum IERC721Expert.BurnAuth | the BurnAuth struct         |

### TagsAdded

```solidity
event TagsAdded(uint256 indexed tokenId, string[] tags)
```

Emitted when tags are added to the SBT


Parameters:

| Name    | Type     | Description                         |
| :------ | :------- | :---------------------------------- |
| tokenId | uint256  | the token where the tags are added  |
| tags    | string[] | the list of tags                    |

## Functions info

### burn (0x89afcb44)

```solidity
function burn(address from) external
```

The function to burn the token


Parameters:

| Name | Type    | Description                                |
| :--- | :------ | :----------------------------------------- |
| from | address | the address to burn from (1 to 1 relation) |

### isExpert (0x76c535ae)

```solidity
function isExpert(address expert) external view returns (bool)
```

The function to check of a user is an expert


Parameters:

| Name   | Type    | Description        |
| :----- | :------ | :----------------- |
| expert | address | the user to check  |


Return values:

| Name | Type | Description               |
| :--- | :--- | :------------------------ |
| [0]  | bool | true if user is an expert |

### getIdByExpert (0x6047fb89)

```solidity
function getIdByExpert(address expert) external view returns (uint256)
```

The function to get the SBT id of an expert


Parameters:

| Name   | Type    | Description                    |
| :----- | :------ | :----------------------------- |
| expert | address | the user to get the SBT id of  |


Return values:

| Name | Type    | Description        |
| :--- | :------ | :----------------- |
| [0]  | uint256 | SBT id of the user |

### burnAuth (0x0489b56f)

```solidity
function burnAuth(
    uint256 tokenId
) external view returns (IERC721Expert.BurnAuth)
```

provides burn authorization of the token id


Parameters:

| Name    | Type    | Description                 |
| :------ | :------ | :-------------------------- |
| tokenId | uint256 | The identifier for a token  |


Return values:

| Name | Type                        | Description |
| :--- | :-------------------------- | :---------- |
| [0]  | enum IERC721Expert.BurnAuth | the auth    |
