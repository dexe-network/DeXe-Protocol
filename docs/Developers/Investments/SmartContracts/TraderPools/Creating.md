# 🏗️ Creating

To create trader pools you need to use `PoolFactory` and call one of these functions:

- ***`deployBasicPool()`*** - deploys the basic pool
- ***`deployInvestPool()`*** - deploys the investment pool

The interface of ***`deployBasicPool()`***:

```solidity
function deployBasicPool(
    string calldata name,
    string calldata symbol,
    TraderPoolDeployParameters calldata parameters
) external;
```

The interface of ***`deployInvestPool()`***:

```solidity
function deployInvestPool(
    string calldata name,
    string calldata symbol,
    TraderPoolDeployParameters calldata parameters
) external;
```

- ***name*** - the name of the pool
- ***symbol*** - pool token symbol
- ***parameters*** - parameters of the pool

***TraderPoolDeployParameters*** structure:

```solidity
struct TraderPoolDeployParameters {
    string descriptionURL;
    address trader;
    bool privatePool;
    bool onlyBABTHolders;
    uint256 totalLPEmission; // zero means unlimited
    address baseToken;
    uint256 minimalInvestment; // zero means any value
    ICoreProperties.CommissionPeriod commissionPeriod;
    uint256 commissionPercentage;
}
```

- ***descriptionURL*** - the IPFS URL of the pool description
- ***trader*** - the address of the trader of the pool
- ***privatePool*** - the publicity parameter of the pool
  - **true** -> *private*
  - **false** -> *public*
- ***onlyBABTHolders*** - the parameter that allows only **BABT** holders to invest into the pool
  - **true** -> *only BABT holders*
  - **false** -> *anyone*
- ***totalLPEmission*** - maximal emission of LP tokens that can be invested (if a parameter is zero-> total emission is unlimited)
- ***baseToken*** - the address of the base token of the pool
- ***minimalInvestment*** - the minimal allowed investment into the pool (if a parameter is **zero** **->** *any amount of allowed*)
- ***commissionPeriod*** - the duration of the commission period
- ***commissionPercentage*** - trader's commission percentage (including **DEXE** commission)

❗ The commission period must correspond to the percentage of commissions.

### Getting information about pools

After calling pool creation methods, the pool automatically gets into the `TraderPoolRegistry`, from where it can be read using the following methods:

- ***`countPools()`*** - gets the total number of pools in the system
- ***`listPools()`*** - gets a list of pool addresses

```solidity
function countPools(
    string memory name
) public view returns (uint256);
```

- ***name*** - the type of pools (`BASIC_POOL` or `INVEST_POOL`)
- **returns** **->** total amount of pools with the provided name

```solidity
function listPools(
    string memory name,
    uint256 offset,
    uint256 limit
) public view returns (address[] memory pools);
```

- ***name*** - the associated pools name
- ***offset*** - the starting index in the pools array
- ***limit*** - the number of pools
- **returns** *->* the array of pools proxies
