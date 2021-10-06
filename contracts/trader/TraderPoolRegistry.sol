// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/trader/ITraderPoolRegistry.sol";

import "../helpers/AbstractDependant.sol";
import "../helpers/Upgrader.sol";

contract TraderPoolRegistry is ITraderPoolRegistry, AbstractDependant, OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant BASIC_POOL_NAME = "BASIC_POOL";
    string public constant RISKY_POOL_NAME = "RISKY_POOL";
    string public constant INVEST_POOL_NAME = "INVEST_POOL";

    Upgrader internal upgrader;

    IContractsRegistry internal _contractsRegistry;
    address internal _traderPoolFactory;

    mapping(string => address) private _implementations;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _userPools; // user => name => pool
    mapping(string => EnumerableSet.AddressSet) internal _allPools; // name => pool

    modifier onlyTraderPoolFactory() {
        require(_traderPoolFactory == _msgSender(), "TraderPoolRegistry: Caller is not a factory");
        _;
    }

    function __TraderPoolRegistry_init() external initializer {
        __Ownable_init();

        upgrader = new Upgrader();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _contractsRegistry = contractsRegistry;
        _traderPoolFactory = contractsRegistry.getTraderPoolFactoryContract();
    }

    function injectDependenciesToExistingPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external onlyOwner {
        EnumerableSet.AddressSet storage pools = _allPools[name];

        uint256 to = (offset + limit).min(pools.length()).max(offset);
        require(to - offset > 0, "TraderPoolRegistry: No pools to inject");

        IContractsRegistry contractsRegistry = _contractsRegistry;

        for (uint256 i = offset; i < to; i++) {
            AbstractDependant dependant = AbstractDependant(pools.at(i));

            if (dependant.injector() == address(0)) {
                dependant.setInjector(address(this));
            }

            dependant.setDependencies(contractsRegistry);
        }
    }

    function upgradeExistingPools(
        string calldata name,
        address newImplementation,
        uint256 offset,
        uint256 limit
    ) external onlyOwner {
        _upgradeExistingPools(name, newImplementation, "", offset, limit);
    }

    /// @notice can only call functions that have no parameters
    function upgradeExistingPoolsAndCall(
        string calldata name,
        address newImplementation,
        string calldata functionSignature,
        uint256 offset,
        uint256 limit
    ) external onlyOwner {
        _upgradeExistingPools(name, newImplementation, functionSignature, offset, limit);
    }

    /// @notice can only call functions that have no parameters
    function _upgradeExistingPools(
        string memory name,
        address newImplementation,
        string memory functionSignature,
        uint256 offset,
        uint256 limit
    ) internal {
        EnumerableSet.AddressSet storage pools = _allPools[name];

        uint256 to = (offset + limit).min(pools.length()).max(offset);
        require(to - offset > 0, "TraderPoolRegistry: No pools to upgrade");

        for (uint256 i = offset; i < to; i++) {
            if (bytes(functionSignature).length > 0) {
                upgrader.upgradeAndCall(
                    pools.at(i),
                    newImplementation,
                    abi.encodeWithSignature(functionSignature)
                );
            } else {
                upgrader.upgrade(pools.at(i), newImplementation);
            }
        }

        /// @dev this doesn't save gas in this tx, but does if the call is paginated
        if (_implementations[name] != newImplementation) {
            _implementations[name] = newImplementation;
        }
    }

    function addImplementation(string calldata name, address implementation) external onlyOwner {
        require(
            _implementations[name] == address(0),
            "TraderPoolRegistry: Adding existing implementation"
        );

        _implementations[name] = implementation;
    }

    function getImplementation(string calldata name) external view override returns (address) {
        address contractAddress = _implementations[name];

        require(contractAddress != address(0), "TraderPoolRegistry: This mapping doesn't exist");

        return contractAddress;
    }

    function getUpgrader() external view override returns (address) {
        require(address(upgrader) != address(0), "TraderPoolRegistry: Bad upgrader");

        return address(upgrader);
    }

    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external override onlyTraderPoolFactory {
        _allPools[name].add(poolAddress);
        _userPools[user][name].add(poolAddress);
    }

    function countPools(string calldata name) external view override returns (uint256) {
        return _allPools[name].length();
    }

    function countUserPools(address user, string calldata name)
        external
        view
        override
        returns (uint256)
    {
        return _userPools[user][name].length();
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

    function listUserPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory pools) {
        uint256 to = (offset + limit).min(_userPools[user][name].length()).max(offset);

        pools = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _userPools[user][name].at(i);
        }
    }

    function isPool(address potentialPool) external view override returns (bool) {
        return
            _allPools[BASIC_POOL_NAME].contains(potentialPool) ||
            _allPools[RISKY_POOL_NAME].contains(potentialPool) ||
            _allPools[INVEST_POOL_NAME].contains(potentialPool);
    }
}
