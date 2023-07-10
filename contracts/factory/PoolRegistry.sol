// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@dlsl/dev-modules/pool-contracts-registry/presets/OwnablePoolContractsRegistry.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "../interfaces/factory/IPoolRegistry.sol";
import "../interfaces/core/IContractsRegistry.sol";

contract PoolRegistry is IPoolRegistry, OwnablePoolContractsRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant BASIC_POOL_NAME = "BASIC_POOL";
    string public constant INVEST_POOL_NAME = "INVEST_POOL";
    string public constant RISKY_PROPOSAL_NAME = "RISKY_POOL_PROPOSAL";
    string public constant INVEST_PROPOSAL_NAME = "INVEST_POOL_PROPOSAL";

    string public constant GOV_POOL_NAME = "GOV_POOL";
    string public constant SETTINGS_NAME = "SETTINGS";
    string public constant VALIDATORS_NAME = "VALIDATORS";
    string public constant USER_KEEPER_NAME = "USER_KEEPER";
    string public constant DISTRIBUTION_PROPOSAL_NAME = "DISTRIBUTION_PROPOSAL";
    string public constant TOKEN_SALE_PROPOSAL_NAME = "TOKEN_SALE_PROPOSAL";

    address internal _poolFactory;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _ownerPools; // pool owner => name => pool

    modifier onlyPoolFactory() {
        _onlyPoolFactory();
        _;
    }

    function setDependencies(address contractsRegistry) public override {
        super.setDependencies(contractsRegistry);

        _poolFactory = IContractsRegistry(contractsRegistry).getPoolFactoryContract();
    }

    function addProxyPool(
        string calldata name,
        address poolAddress
    ) external override onlyPoolFactory {
        _addProxyPool(name, poolAddress);
    }

    function associateUserWithPool(
        address user,
        string calldata name,
        address poolAddress
    ) external onlyPoolFactory {
        _ownerPools[user][name].add(poolAddress);
    }

    function countAssociatedPools(
        address user,
        string calldata name
    ) external view override returns (uint256) {
        return _ownerPools[user][name].length();
    }

    function listAssociatedPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory pools) {
        return _ownerPools[user][name].part(offset, limit);
    }

    function listTraderPoolsWithInfo(
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
        pools = _pools[name].part(offset, limit);

        poolInfos = new ITraderPool.PoolInfo[](pools.length);
        leverageInfos = new ITraderPool.LeverageInfo[](pools.length);

        for (uint256 i = 0; i < pools.length; i++) {
            ITraderPool traderPool = ITraderPool(pools[i]);

            poolInfos[i] = traderPool.getPoolInfo();
            leverageInfos[i] = traderPool.getLeverageInfo();
        }
    }

    function isBasicPool(address potentialPool) public view override returns (bool) {
        return _isPool(BASIC_POOL_NAME, potentialPool);
    }

    function isInvestPool(address potentialPool) public view override returns (bool) {
        return _isPool(INVEST_POOL_NAME, potentialPool);
    }

    function isTraderPool(address potentialPool) external view override returns (bool) {
        return isBasicPool(potentialPool) || isInvestPool(potentialPool);
    }

    function isGovPool(address potentialPool) external view override returns (bool) {
        return _isPool(GOV_POOL_NAME, potentialPool);
    }

    function _isPool(string memory name, address potentialPool) internal view returns (bool) {
        return _pools[name].contains(potentialPool);
    }

    function _onlyPoolFactory() internal view {
        require(_poolFactory == msg.sender, "PoolRegistry: Caller is not a factory");
    }
}
