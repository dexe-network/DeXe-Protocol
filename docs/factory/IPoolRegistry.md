# IPoolRegistry

## Interface Description


License: MIT

## 

```solidity
interface IPoolRegistry
```

This is the PoolRegistry contract, a tuned ContractsRegistry contract. Its purpose is the management of
proposal pools, GovPools and contracts related to GovPools.
The owner of this contract is capable of upgrading pools' implementation via the ProxyBeacon pattern
## Functions info

### addProxyPool (0x09ae152b)

```solidity
function addProxyPool(string calldata name, address poolAddress) external
```

The function to add the pool proxy to the registry (called by the PoolFactory)


Parameters:

| Name        | Type    | Description                    |
| :---------- | :------ | :----------------------------- |
| name        | string  | the type of the pool           |
| poolAddress | address | the address of the pool to add |

### toggleSphereXEngine (0x419aa023)

```solidity
function toggleSphereXEngine(bool on) external
```

The function to toggle the SphereX engine to all the contracts handled by the registry


Parameters:

| Name | Type | Description                          |
| :--- | :--- | :----------------------------------- |
| on   | bool | whether to turn the engine on or off |

### isGovPool (0x9e475551)

```solidity
function isGovPool(address potentialPool) external view returns (bool)
```

The function to check if the given address is a valid GovPool


Parameters:

| Name          | Type    | Description             |
| :------------ | :------ | :---------------------- |
| potentialPool | address | the address to inspect  |


Return values:

| Name | Type | Description                                       |
| :--- | :--- | :------------------------------------------------ |
| [0]  | bool | true if the address is a GovPool, false otherwise |
