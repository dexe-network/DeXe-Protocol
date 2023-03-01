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
- ***totalLPEmission*** - maximal emission of LP tokens that can be invested (if a parameter is zero-> total emission is unlimited)
- ***baseToken*** - the address of the base token of the pool
- ***minimalInvestment*** - the minimal allowed investment into the pool (if a parameter is **zero** **->** *any amount of allowed*)
-  ***commissionPeriod*** - the duration of the commission period
- ***commissionPercentage*** - trader's commission percentage (including **DEXE** commission)

❗ The commission period must correspond to the percentage of commissions.

### Getting information about pools

After calling pool creation methods, the pool automatically gets into the `TraderPoolRegistry`, from where it can be read using the following methods:
- ***`countPools()`*** - gets the total number of pools in the system
- ***`listPools()`*** - gets a list of pool addresses

```solidity
function countPools(
    string memory name
) public returns (uint256);
```
- ***name*** - the type of pools (`BASIC_POOL` or `INVEST_POOL`)
- **returns** **->** total amount of pools with the provided name

```solidity
function listPools(
    string memory name,
    uint256 offset,
    uint256 limit
) public returns (address[] memory pools);
```

- ***name*** - the associated pools name
- ***offset*** - the starting index in the pools array
- ***limit*** - the number of pools
- **returns** *->* the array of pools proxies

##### Pool Parameters

```solidity
struct PoolParameters {
    string descriptionURL;
    address trader;
    bool privatePool;
    uint8 baseTokenDecimals;
    bool onlyBABTHolders;
    uint256 totalLPEmission;
    address baseToken;
    uint256 minimalInvestment;
    ICoreProperties.CommissionPeriod commissionPeriod;
    uint256 commissionPercentage;
    uint256 traderBABTId;
}
```
- ***descriptionURL*** - the **IPFS** URL of the description
- ***trader*** - the address of trader of this pool
- ***privatePool*** - the publicity of the pool. Of the pool is private, only private investors are allowed to invest into it
- ***baseTokenDecimals*** - are the decimals of base token (just the gas savings)
- ***onlyBABTHolders*** - if true, only verified users will be allowed to interact with the pool (`UserRegistry`/`Verification`)
- ***totalLPEmission*** - the total number of pool's LP tokens. The investors are disallowed to invest more that this number
    - if ***0*** **->** unlimited
- ***baseToken*** - the address of pool's base token
- ***minimalInvestment*** - is the minimal number of base tokens the investor is allowed to invest (in **18** decimals)
    - if ***0*** **->** any value
- ***commissionPeriod*** - represents the duration of the commission period
- ***commissionPercentage*** - trader's commission percentage (DEXE takes commission from this commission)
- ***traderBABTId*** - the **BABT** id of the trader
    - if ***0*** **->** the trader is **NOT** verified