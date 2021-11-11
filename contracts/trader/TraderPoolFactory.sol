// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/trader/ITraderPoolFactory.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/trader/IRiskyTraderPool.sol";
import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/IInvestTraderPool.sol";
import "../interfaces/trader/ITraderPool.sol";

import "../trader/TraderPoolRegistry.sol";
import "../helpers/AbstractDependant.sol";
import "../core/CoreProperties.sol";
import "../core/Globals.sol";
import "../core/PriceFeed.sol";

contract TraderPoolFactory is ITraderPoolFactory, OwnableUpgradeable, AbstractDependant {
    IContractsRegistry internal _contractsRegistry;
    TraderPoolRegistry internal _poolRegistry;
    PriceFeed internal _priceFeed;
    CoreProperties internal _coreProperties;

    mapping(string => function(
        address,
        string calldata,
        string calldata,
        ITraderPool.PoolParameters memory
    ))
        internal _initMetods; // name => _init

    event Deployed(address user, string poolName, address at);

    function __TraderPoolFactory_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _contractsRegistry = contractsRegistry;

        _poolRegistry = TraderPoolRegistry(contractsRegistry.getTraderPoolRegistryContract());
        _priceFeed = PriceFeed(contractsRegistry.getPriceFeedContract());
        _coreProperties = CoreProperties(contractsRegistry.getCorePropertiesContract());

        _initMetods[_poolRegistry.RISKY_POOL_NAME()] = _initRisky;
        _initMetods[_poolRegistry.BASIC_POOL_NAME()] = _initBasic;
        _initMetods[_poolRegistry.INVEST_POOL_NAME()] = _initInvest;
    }

    function _deploy(
        string memory name,
        string calldata poolName,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) internal {
        _validate(_poolParameters);

        address _proxy = address(new BeaconProxy(_poolRegistry.getProxyBeacon(name), ""));

        _initMetods[name](_proxy, poolName, symbol, _poolParameters);

        AbstractDependant(_proxy).setDependencies(_contractsRegistry);
        AbstractDependant(_proxy).setInjector(address(_poolRegistry));

        _poolRegistry.addPool(_msgSender(), name, _proxy);

        emit Deployed(_msgSender(), name, _proxy);
    }

    function deployRiskyPool(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) external {
        _deploy(_poolRegistry.RISKY_POOL_NAME(), name, symbol, _poolParameters);
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) external {
        _deploy(_poolRegistry.BASIC_POOL_NAME(), name, symbol, _poolParameters);
    }

    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) external {
        _deploy(_poolRegistry.INVEST_POOL_NAME(), name, symbol, _poolParameters);
    }

    function _initRisky(
        address _proxy,
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) internal {
        IRiskyTraderPool(_proxy).__RiskyTraderPool_init(name, symbol, _poolParameters);
    }

    function _initBasic(
        address _proxy,
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) internal {
        IBasicTraderPool(_proxy).__BasicTraderPool_init(name, symbol, _poolParameters);
    }

    function _initInvest(
        address _proxy,
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters
    ) internal {
        IInvestTraderPool(_proxy).__InvestTraderPool_init(name, symbol, _poolParameters);
    }

    function _validate(ITraderPool.PoolParameters memory _poolParameters) internal view {
        (uint256 general, uint256[] memory byPeriod) = _coreProperties.getTraderCommissions();

        require(
            _priceFeed.isSupportedBaseToken(_poolParameters.baseToken),
            "TraderPoolFactory: Unsupported token."
        );

        require(
            _poolParameters.commissionPercentage >= general &&
                _poolParameters.commissionPercentage <=
                byPeriod[uint256(_poolParameters.commissionPeriod)],
            "TraderPoolFactory: Incorrect percentage."
        );
    }
}
