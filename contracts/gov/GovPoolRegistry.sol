// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/gov/IGovPoolRegistry.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/pool-contracts-registry/AbstractPoolContractsRegistry.sol";
import "../proxy/contracts-registry/AbstractDependant.sol";

contract GovPoolRegistry is IGovPoolRegistry, AbstractPoolContractsRegistry, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant GOV_NAME = "GOV_POOL";
    string public constant SETTINGS_NAME = "SETTINGS";
    string public constant USER_KEEPER_NAME = "USER_KEEPER";

    address internal _traderPoolFactory;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _ownerPools; // pool owner => name => pool

    modifier onlyTraderPoolFactory() {
        require(_traderPoolFactory == _msgSender(), "GovPoolRegistry: Caller is not a factory");
        _;
    }

    function setDependencies(address contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _traderPoolFactory = registry.getTraderPoolFactoryContract();
    }

    function addPool(
        address user,
        string calldata name,
        address poolAddress
    ) external override onlyTraderPoolFactory {
        _addPool(name, poolAddress);

        _ownerPools[user][name].add(poolAddress);
    }

    function countOwnerPools(address user, string calldata name)
        external
        view
        override
        returns (uint256)
    {
        return _ownerPools[user][name].length();
    }

    function listOwnerPools(
        address user,
        string calldata name,
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory pools) {
        uint256 to = (offset + limit).min(_ownerPools[user][name].length()).max(offset);

        pools = new address[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            pools[i - offset] = _ownerPools[user][name].at(i);
        }
    }
}
