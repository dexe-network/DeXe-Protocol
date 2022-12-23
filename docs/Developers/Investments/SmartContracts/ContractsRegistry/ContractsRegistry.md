# 📃 ContractsRegistry

The purpose of this module is to provide an organized registry of the project's smartcontracts together with the upgradeability and dependency injection mechanisms.

The `ContractsRegistry` should be used as the highest level smartcontract that is aware of any other
contract present in the system. The contracts that demand other system's contracts would then inherit
special `AbstractDependant` contract and override ***`setDependencies()`*** function to enable `ContractsRegistry`
to inject dependencies into them.

The `ContractsRegistry` will help with the following usecases:

1) Making the system upgradeable
2) Making the system contracts-interchangeable
3) Simplifying the contracts management and deployment

The `ContractsRegistry` acts as a Transparent proxy deployer. One can add proxy-compatible implementations to the registry
and deploy proxies to them. Then these proxies can be upgraded easily using the `ContractsRegistry`.
The `ContractsRegistry` itself can be deployed behind a proxy as well.

The dependency injection system may come in handy when one wants to substitute a contract `A` with a contract `B`
(for example contract `A` got exploited) without a necessity of redeploying the whole system. One would just add
a new `B` contract to a `ContractsRegistry` and re-inject all the required dependencies. Dependency injection mechanism
also works with factories.

The management is simplified because all of the contracts are now located in a single place.
#
Function ***`injectDependencies()`*** injects the dependencies into the given contract.

```solidity
 function injectDependencies(string calldata name) external onlyOwner
 ```
- ***name*** - the name of the contract

#
Function ***`upgradeContract()`*** used to upgrade added proxy contract with a new implementation.
```solidity
function upgradeContract(string calldata name, address newImplementation) external onlyOwner
```
- ***name*** - the name of the proxy contract
- ***newImplementation*** - the new implementation the proxy should be upgraded to

❗ It is the **Owner's** responsibility to ensure the compatibility between implementations

#
Function ***`upgradeContractAndCall()`*** is used to upgrade added proxy contract with a new implementation, providing data.

```solidity
function upgradeContractAndCall(
    string calldata name,
    address newImplementation,
    bytes calldata data
) external onlyOwner
```
- ***name*** - the name of the proxy contract
- ***newImplementation*** - the new implementation the proxy should be upgraded to
- ***data*** - the data that the new implementation will be called with. This can be an **ABI** encoded function call

❗ It is the **Owner's** responsibility to ensure the compatibility between implementations

#
Function ***`addContract()`*** adds pure contracts to the `ContractsRegistry`. These should either be the contracts the system does not have direct upgradeability control over, or the contracts that are not upgradeable.

```solidity
function addContract(string calldata name, address contractAddress) external onlyOwner
```
- ***name*** - the name to associate the contract with
- ***contractAddress*** - the address of the contract

#
Function ***`addProxyContract()`*** is used to add the contracts and deploy the proxy above them. It should be used to add contract that the `ContractsRegistry` should be able to upgrade.
```solidity
function addProxyContract(string calldata name, address contractAddress) external onlyOwner
```
- ***name*** - the name to associate the contract with
- ***contractAddress*** - the address of the implementation

#
Function adds the already deployed proxy to the `ContractsRegistry`. This might be used when the system migrates to a new `ContractRegistry`. This means that the new `ProxyUpgrader` must have the credentials to upgrade the added proxies.

```solidity
function justAddProxyContract(
    string calldata name,
    address contractAddress
) external onlyOwner
```
- ***name*** - the name to associate the contract with
- ***contractAddress*** - the address of the proxy

#
Function ***`removeContract()`*** is used to remove the contract from the `ContractsRegistry`

```solidity
function removeContract(string calldata name) external onlyOwner
```
- ***name*** - the associated name with the contract