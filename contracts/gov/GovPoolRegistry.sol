// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/pool-contracts-registry/AbstractPoolContractsRegistry.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "../interfaces/gov/IGovPoolRegistry.sol";
import "../interfaces/core/IContractsRegistry.sol";

contract GovPoolRegistry is IGovPoolRegistry, AbstractPoolContractsRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant GOV_POOL_NAME = "GOV_POOL";
    string public constant SETTINGS_NAME = "SETTINGS";
    string public constant VALIDATORS_NAME = "VALIDATORS";
    string public constant USER_KEEPER_NAME = "USER_KEEPER";

    address internal _poolFactory;

    mapping(address => mapping(string => EnumerableSet.AddressSet)) internal _ownerPools; // pool owner => name => pool

    function _onlyPoolFactory() internal view override {
        require(_poolFactory == _msgSender(), "GovPoolRegistry: Caller is not a factory");
    }

    function setDependencies(address contractsRegistry) public override {
        super.setDependencies(contractsRegistry);

        _poolFactory = IContractsRegistry(contractsRegistry).getPoolFactoryContract();
    }

    function associateUserWithPool(
        address user,
        string calldata name,
        address poolAddress
    ) external override onlyPoolFactory {
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
        return _ownerPools[user][name].part(offset, limit);
    }
}
