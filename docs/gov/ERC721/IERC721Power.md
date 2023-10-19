# IERC721Power

## Interface Description


License: MIT

## 

```solidity
interface IERC721Power is IERC721EnumerableUpgradeable
```

This is the custom NFT contract with voting power
## Structs info

### NftInfo

```solidity
struct NftInfo {
	uint64 lastUpdate;
	uint256 currentPower;
	uint256 currentCollateral;
	uint256 maxPower;
	uint256 requiredCollateral;
}
```

This struct holds NFT Power parameters. These parameters are used to recalculate nft power


Parameters:

| Name               | Type    | Description                                    |
| :----------------- | :------ | :--------------------------------------------- |
| lastUpdate         | uint64  | the last time when the power was recalculated  |
| currentPower       | uint256 | the current nft power                          |
| currentCollateral  | uint256 | the current nft collateral                     |
| maxPower           | uint256 | the maximum nft power limit                    |
| requiredCollateral | uint256 | the required collateral amount                 |

## Functions info

### totalPower (0xdb3ad22c)

```solidity
function totalPower() external view returns (uint256)
```

Get total power


Return values:

| Name | Type    | Description |
| :--- | :------ | :---------- |
| [0]  | uint256 | totalPower  |

### addCollateral (0xa8f35adf)

```solidity
function addCollateral(uint256 amount, uint256 tokenId) external
```

Add collateral amount to certain nft


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| amount  | uint256 | Wei         |
| tokenId | uint256 | Nft number  |

### removeCollateral (0x6a9b1891)

```solidity
function removeCollateral(uint256 amount, uint256 tokenId) external
```

Remove collateral amount from certain nft


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| amount  | uint256 | Wei         |
| tokenId | uint256 | Nft number  |

### recalculateNftPower (0xf6462f4a)

```solidity
function recalculateNftPower(uint256 tokenId) external returns (uint256)
```

Recalculate nft power (coefficient)


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| tokenId | uint256 | Nft number  |


Return values:

| Name | Type    | Description   |
| :--- | :------ | :------------ |
| [0]  | uint256 | new Nft power |

### getMinPowerForNft (0xb60b71c0)

```solidity
function getMinPowerForNft(uint256 tokenId) external view returns (uint256)
```

Return min possible power (coefficient) for nft


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| tokenId | uint256 | Nft number  |


Return values:

| Name | Type    | Description       |
| :--- | :------ | :---------------- |
| [0]  | uint256 | min power for Nft |

### getMaxPowerForNft (0x4fc685f7)

```solidity
function getMaxPowerForNft(uint256 tokenId) external view returns (uint256)
```

Return max possible power (coefficient) for nft


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| tokenId | uint256 | Nft number  |


Return values:

| Name | Type    | Description       |
| :--- | :------ | :---------------- |
| [0]  | uint256 | max power for Nft |

### getRequiredCollateralForNft (0x2e8e5fae)

```solidity
function getRequiredCollateralForNft(
    uint256 tokenId
) external view returns (uint256)
```

Return required collateral amount for nft


Parameters:

| Name    | Type    | Description |
| :------ | :------ | :---------- |
| tokenId | uint256 | Nft number  |


Return values:

| Name | Type    | Description                 |
| :--- | :------ | :-------------------------- |
| [0]  | uint256 | required collateral for Nft |

### getNftPower (0x412e8a29)

```solidity
function getNftPower(uint256 tokenId) external view returns (uint256)
```

The function to get current NFT power


Parameters:

| Name    | Type    | Description     |
| :------ | :------ | :-------------- |
| tokenId | uint256 | the Nft number  |


Return values:

| Name | Type    | Description              |
| :--- | :------ | :----------------------- |
| [0]  | uint256 | current power of the Nft |
