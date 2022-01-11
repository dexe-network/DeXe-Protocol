// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/trader/ITraderPoolRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "../helpers/ProxyBeacon.sol";

contract TraderPoolRegistry is ITraderPoolRegistry, AbstractDependant, OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Address for address;
    using Math for uint256;

    string public constant BASIC_POOL_NAME = "BASIC_POOL";
    string public constant INVEST_POOL_NAME = "INVEST_POOL";
    string public constant RISKY_PROPOSAL_NAME = "RISKY_POOL_PROPOSAL";
    string public constant INVEST_PROPOSAL_NAME = "INVEST_POOL_PROPOSAL";

    IContractsRegistry internal _contractsRegistry;
    address internal _traderPoolFactory;

    mapping(string => ProxyBeacon) private _beacons;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _traderPools; // trader => name => pool
    mapping(string => EnumerableSet.AddressSet) internal _allPools; // name => pool

    modifier onlyTraderPoolFactory() {
        require(_traderPoolFactory == _msgSender(), "TraderPoolRegistry: Caller is not a factory");
        _;
    }

    function __TraderPoolRegistry_init() external initializer {
        __Ownable_init();

        _beacons[BASIC_POOL_NAME] = new ProxyBeacon();
        _beacons[INVEST_POOL_NAME] = new ProxyBeacon();
        _beacons[RISKY_PROPOSAL_NAME] = new ProxyBeacon();
        _beacons[INVEST_PROPOSAL_NAME] = new ProxyBeacon();
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;
        _traderPoolFactory = contractsRegistry.getTraderPoolFactoryContract();
    }

    function injectDependenciesToExistingPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external override onlyOwner {
        EnumerableSet.AddressSet storage pools = _allPools[name];

        uint256 to = (offset + limit).min(pools.length()).max(offset);
        require(to - offset > 0, "TraderPoolRegistry: No pools to inject");

        IContractsRegistry contractsRegistry = _contractsRegistry;

        for (uint256 i = offset; i < to; i++) {
            AbstractDependant dependant = AbstractDependant(pools.at(i));
            dependant.setDependencies(contractsRegistry);
        }
    }

    function _setNewImplementation(string calldata name, address newImplementation) internal {
        if (_beacons[name].implementation() != newImplementation) {
            _beacons[name].upgrade(newImplementation);
        }
    }

    function setNewImplementations(string[] calldata names, address[] calldata newImplementations)
        external
        override
        onlyOwner
    {
        for (uint256 i = 0; i < names.length; i++) {
            _setNewImplementation(names[i], newImplementations[i]);
        }
    }

    function getImplementation(string calldata name) external view override returns (address) {
        address contractAddress = _beacons[name].implementation();

        require(contractAddress != address(0), "TraderPoolRegistry: This mapping doesn't exist");

        return contractAddress;
    }

    function getProxyBeacon(string calldata name) external view override returns (address) {
        require(address(_beacons[name]) != address(0), "TraderPoolRegistry: Bad ProxyBeacon");

        return address(_beacons[name]);
    }

    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external override onlyTraderPoolFactory {
        _allPools[name].add(poolAddress);
        _traderPools[user][name].add(poolAddress);
    }

    function countPools(string calldata name) external view override returns (uint256) {
        return _allPools[name].length();
    }

    function countTraderPools(address user, string calldata name)
        external
        view
        override
        returns (uint256)
    {
        return _traderPools[user][name].length();
    }

    function listPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory pools) {
        uint256 to = (offset + limit).min(_allPools[name].length()).max(offset);

        pools = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _allPools[name].at(i);
        }
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
        uint256 to = (offset + limit).min(_allPools[name].length()).max(offset);

        pools = new address[](to - offset);
        poolInfos = new ITraderPool.PoolInfo[](to - offset);
        leverageInfos = new ITraderPool.LeverageInfo[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _allPools[name].at(i);

            poolInfos[i - offset] = ITraderPool(pools[i - offset]).getPoolInfo();
            leverageInfos[i - offset] = ITraderPool(pools[i - offset]).getLeverageInfo();
        }
    }

    function isBasePool(address potentialPool) public view override returns (bool) {
        return _allPools[BASIC_POOL_NAME].contains(potentialPool);
    }

    function isInvestPool(address potentialPool) public view override returns (bool) {
        return _allPools[INVEST_POOL_NAME].contains(potentialPool);
    }

    function isPool(address potentialPool) external view override returns (bool) {
        return isBasePool(potentialPool) || isInvestPool(potentialPool);
    }
}
