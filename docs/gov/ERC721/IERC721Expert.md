# IERC721Expert

## Interface Description


License: MIT

## 

```solidity
interface IERC721Expert is IERC721Upgradeable
```


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


### TagsAdded

```solidity
event TagsAdded(uint256 indexed tokenId, string[] tags)
```


## Functions info

### mint (0xd0def521)

```solidity
function mint(
    address to,
    string calldata uri_
) external returns (uint256 tokenId)
```


### burn (0x89afcb44)

```solidity
function burn(address from) external
```


### setTokenURI (0x162094c4)

```solidity
function setTokenURI(uint256 tokenId, string calldata uri_) external
```


### isExpert (0x76c535ae)

```solidity
function isExpert(address expert) external view returns (bool)
```


### getIdByExpert (0x6047fb89)

```solidity
function getIdByExpert(address expert) external view returns (uint256)
```


### burnAuth (0x0489b56f)

```solidity
function burnAuth(
    uint256 tokenId
) external view returns (IERC721Expert.BurnAuth)
```

