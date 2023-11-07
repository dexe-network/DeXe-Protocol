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
	uint256 maxRawPower;
	uint256 currentRawPower;
	uint256 requiredCollateral;
	uint256 currentCollateral;
}
```

This struct holds NFT Power parameters. These parameters are used to recalculate nft power


Parameters:

| Name               | Type    | Description                                    |
| :----------------- | :------ | :--------------------------------------------- |
| lastUpdate         | uint64  | the last time when the power was recalculated  |
| maxRawPower        | uint256 | the maximum raw nft power limit                |
| currentRawPower    | uint256 | the current raw nft power                      |
| requiredCollateral | uint256 | the required collateral amount                 |
| currentCollateral  | uint256 | the current nft collateral                     |

### NftInfoView

```solidity
struct NftInfoView {
	IERC721Power.NftInfo rawInfo;
	uint256 maxPower;
	uint256 minPower;
	uint256 currentPower;
}
```

The struct to get info about the NFT


Parameters:

| Name         | Type                        | Description         |
| :----------- | :-------------------------- | :------------------ |
| rawInfo      | struct IERC721Power.NftInfo | the raw NFT info    |
| maxPower     | uint256                     | real max nft power  |
| minPower     | uint256                     | real min nft power  |
| currentPower | uint256                     | real nft power      |

## Functions info

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

### recalculateNftPowers (0xa79b53d5)

```solidity
function recalculateNftPowers(uint256[] calldata tokenIds) external
```

Recalculate nft power (coefficient)


Parameters:

| Name     | Type      | Description |
| :------- | :-------- | :---------- |
| tokenIds | uint256[] | Nft numbers |

### totalPower (0xdb3ad22c)

```solidity
function totalPower() external view returns (uint256)
```

Get total power


Return values:

| Name | Type    | Description |
| :--- | :------ | :---------- |
| [0]  | uint256 | totalPower  |

### getNftMaxPower (0x6c889f41)

```solidity
function getNftMaxPower(uint256 tokenId) external view returns (uint256)
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

### getNftMinPower (0x7c24b33a)

```solidity
function getNftMinPower(uint256 tokenId) external view returns (uint256)
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

### getNftRequiredCollateral (0xcbf208a7)

```solidity
function getNftRequiredCollateral(
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
