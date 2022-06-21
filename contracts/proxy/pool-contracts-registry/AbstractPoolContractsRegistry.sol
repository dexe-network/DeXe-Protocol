// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../contracts-registry/AbstractDependant.sol";

import "./ProxyBeacon.sol";

abstract contract AbstractPoolContractsRegistry is OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;

    address internal _contractsRegistry;

    mapping(string => ProxyBeacon) private _beacons;
    mapping(string => EnumerableSet.AddressSet) internal _pools; // name => pool

    modifier onlyPoolFactory() {
        _onlyPoolFactory();
        _;
    }

    function _onlyPoolFactory() internal view virtual;

    function __PoolContractsRegistry_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        _contractsRegistry = contractsRegistry;
    }

    function setNewImplementations(string[] calldata names, address[] calldata newImplementations)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < names.length; i++) {
            if (address(_beacons[names[i]]) == address(0)) {
                _beacons[names[i]] = new ProxyBeacon();
            }

            if (_beacons[names[i]].implementation() != newImplementations[i]) {
                _beacons[names[i]].upgrade(newImplementations[i]);
            }
        }
    }

    function injectDependenciesToExistingPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external onlyOwner {
        EnumerableSet.AddressSet storage pools = _pools[name];

        uint256 to = (offset + limit).min(pools.length()).max(offset);

        require(to != offset, "PoolContractsRegistry: No pools to inject");

        address contractsRegistry = _contractsRegistry;

        for (uint256 i = offset; i < to; i++) {
            AbstractDependant(pools.at(i)).setDependencies(contractsRegistry);
        }
    }

    function getImplementation(string calldata name) external view returns (address) {
        address contractAddress = _beacons[name].implementation();

        require(
            contractAddress != address(0),
            "PoolContractsRegistry: This mapping doesn't exist"
        );

        return contractAddress;
    }

    function getProxyBeacon(string calldata name) external view returns (address) {
        require(address(_beacons[name]) != address(0), "PoolContractsRegistry: Bad ProxyBeacon");

        return address(_beacons[name]);
    }

    function addPool(string calldata name, address poolAddress) external onlyPoolFactory {
        _pools[name].add(poolAddress);
    }

    function countPools(string calldata name) external view returns (uint256) {
        return _pools[name].length();
    }

    function listPools(
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory pools) {
        uint256 to = (offset + limit).min(_pools[name].length()).max(offset);

        pools = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _pools[name].at(i);
        }
    }
}
