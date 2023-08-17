// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@solarity/solidity-lib/contracts-registry/pools/presets/OwnablePoolContractsRegistry.sol";
import "@solarity/solidity-lib/libs/arrays/Paginator.sol";

import "../interfaces/factory/IPoolRegistry.sol";
import "../interfaces/core/IContractsRegistry.sol";

contract PoolRegistry is IPoolRegistry, OwnablePoolContractsRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using Math for uint256;

    string public constant GOV_POOL_NAME = "GOV_POOL";
    string public constant SETTINGS_NAME = "SETTINGS";
    string public constant VALIDATORS_NAME = "VALIDATORS";
    string public constant USER_KEEPER_NAME = "USER_KEEPER";
    string public constant DISTRIBUTION_PROPOSAL_NAME = "DISTRIBUTION_PROPOSAL";
    string public constant TOKEN_SALE_PROPOSAL_NAME = "TOKEN_SALE_PROPOSAL";

    string public constant EXPERT_NFT_NAME = "EXPERT_NFT";
    string public constant NFT_MULTIPLIER_NAME = "NFT_MULTIPLIER";

    string public constant ROOT_POWER_NAME = "ROOT_POWER";

    address internal _poolFactory;

    modifier onlyPoolFactory() {
        _onlyPoolFactory();
        _;
    }

    function setDependencies(address contractsRegistry, bytes memory data) public override {
        super.setDependencies(contractsRegistry, data);

        _poolFactory = IContractsRegistry(contractsRegistry).getPoolFactoryContract();
    }

    function addProxyPool(
        string calldata name,
        address poolAddress
    ) external override onlyPoolFactory {
        _addProxyPool(name, poolAddress);
    }

    function isGovPool(address potentialPool) external view override returns (bool) {
        return isPool(GOV_POOL_NAME, potentialPool);
    }

    function _onlyPoolFactory() internal view {
        require(_poolFactory == msg.sender, "PoolRegistry: Caller is not a factory");
    }
}
