// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/trader/ITraderPoolRegistry.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/pool-contracts-registry/AbstractPoolContractsRegistry.sol";
import "../proxy/contracts-registry/AbstractDependant.sol";

contract TraderPoolRegistry is
    ITraderPoolRegistry,
    AbstractPoolContractsRegistry,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant BASIC_POOL_NAME = "BASIC_POOL";
    string public constant INVEST_POOL_NAME = "INVEST_POOL";
    string public constant RISKY_PROPOSAL_NAME = "RISKY_POOL_PROPOSAL";
    string public constant INVEST_PROPOSAL_NAME = "INVEST_POOL_PROPOSAL";

    address internal _poolFactory;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _traderPools; // trader => name => pool

    modifier onlyPoolFactory() {
        require(_poolFactory == _msgSender(), "TraderPoolRegistry: Caller is not a factory");
        _;
    }

    function setDependencies(address contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolFactory = registry.getPoolFactoryContract();
    }

    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external override onlyPoolFactory {
        _addPool(name, poolAddress);

        _traderPools[user][name].add(poolAddress);
    }

    function countTraderPools(address user, string calldata name)
        external
        view
        override
        returns (uint256)
    {
        return _traderPools[user][name].length();
    }

    function listTraderPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory pools) {
        uint256 to = (offset + limit).min(_traderPools[user][name].length()).max(offset);

        pools = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _traderPools[user][name].at(i);
        }
    }

    function listPoolsWithInfo(
        string calldata name,
        uint256 offset,
        uint256 limit
    )
        external
        view
        override
        returns (
            address[] memory pools,
            ITraderPool.PoolInfo[] memory poolInfos,
            ITraderPool.LeverageInfo[] memory leverageInfos
        )
    {
        uint256 to = (offset + limit).min(_pools[name].length()).max(offset);

        pools = new address[](to - offset);
        poolInfos = new ITraderPool.PoolInfo[](to - offset);
        leverageInfos = new ITraderPool.LeverageInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _pools[name].at(i);

            poolInfos[i - offset] = ITraderPool(pools[i - offset]).getPoolInfo();
            leverageInfos[i - offset] = ITraderPool(pools[i - offset]).getLeverageInfo();
        }
    }

    function isBasicPool(address potentialPool) public view override returns (bool) {
        return _pools[BASIC_POOL_NAME].contains(potentialPool);
    }

    function isInvestPool(address potentialPool) public view override returns (bool) {
        return _pools[INVEST_POOL_NAME].contains(potentialPool);
    }

    function isPool(address potentialPool) external view override returns (bool) {
        return isBasicPool(potentialPool) || isInvestPool(potentialPool);
    }
}
