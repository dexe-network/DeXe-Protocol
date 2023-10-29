# IContractsRegistry

## Interface Description


License: MIT

## 

```solidity
interface IContractsRegistry
```

This is the registry contract of DEXE platform that stores information about
the other contracts used by the protocol. Its purpose is to keep track of the propotol's
contracts, provide upgradeability mechanism and dependency injection mechanism.
## Functions info

### setSphereXEngine (0x44a63d1b)

```solidity
function setSphereXEngine(address sphereXEngine) external
```

The function to set the SphereX engine to all the contracts handled by the registry


Parameters:

| Name          | Type    | Description                       |
| :------------ | :------ | :-------------------------------- |
| sphereXEngine | address | the address of the SphereX engine |

### getUserRegistryContract (0x435403b4)

```solidity
function getUserRegistryContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                   |
| :--- | :------ | :---------------------------- |
| [0]  | address | UserRegistry contract address |

### getPoolFactoryContract (0x475c5bc6)

```solidity
function getPoolFactoryContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                  |
| :--- | :------ | :--------------------------- |
| [0]  | address | PoolFactory contract address |

### getPoolRegistryContract (0x892dd52a)

```solidity
function getPoolRegistryContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                   |
| :--- | :------ | :---------------------------- |
| [0]  | address | PoolRegistry contract address |

### getDEXEContract (0x9fc64f57)

```solidity
function getDEXEContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                 |
| :--- | :------ | :-------------------------- |
| [0]  | address | DEXE token contract address |

### getUSDContract (0xa5bac943)

```solidity
function getUSDContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                                                                      |
| :--- | :------ | :------------------------------------------------------------------------------- |
| [0]  | address | Platform's native USD token contract address. This may be USDT/BUSD/USDC/DAI/FEI |

### getPriceFeedContract (0x9bc0c5d2)

```solidity
function getPriceFeedContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                |
| :--- | :------ | :------------------------- |
| [0]  | address | PriceFeed contract address |

### getUniswapV2RouterContract (0xaba2227e)

```solidity
function getUniswapV2RouterContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                                                               |
| :--- | :------ | :------------------------------------------------------------------------ |
| [0]  | address | UniswapV2Router contract address. This can be any forked contract as well |

### getUniswapV3QuoterContract (0x5c6a5405)

```solidity
function getUniswapV3QuoterContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                                                               |
| :--- | :------ | :------------------------------------------------------------------------ |
| [0]  | address | UniswapV3Quoter contract address. This can be any forked contract as well |

### getUniswapV2FactoryContract (0x694712be)

```solidity
function getUniswapV2FactoryContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                                                                |
| :--- | :------ | :------------------------------------------------------------------------- |
| [0]  | address | UniswapV2Factory contract address. This can be any forked contract as well |

### getTreasuryContract (0x26c74fc3)

```solidity
function getTreasuryContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                      |
| :--- | :------ | :------------------------------- |
| [0]  | address | Treasury contract/wallet address |

### getCorePropertiesContract (0xc1ff8103)

```solidity
function getCorePropertiesContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                     |
| :--- | :------ | :------------------------------ |
| [0]  | address | CoreProperties contract address |

### getBABTContract (0x05a1b626)

```solidity
function getBABTContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description           |
| :--- | :------ | :-------------------- |
| [0]  | address | BABT contract address |

### getDexeExpertNftContract (0x029f708b)

```solidity
function getDexeExpertNftContract() external view returns (address)
```

Used in dependency injection mechanism


Return values:

| Name | Type    | Description                    |
| :--- | :------ | :----------------------------- |
| [0]  | address | DexeExpertNft contract address |
