// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/trader/ITraderPoolFactory.sol";
import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/contracts-registry/AbstractDependant.sol";

import "../trader/BasicTraderPool.sol";
import "../trader/InvestTraderPool.sol";
import "../trader/TraderPoolRiskyProposal.sol";
import "../trader/TraderPoolInvestProposal.sol";
import "../trader/TraderPoolRegistry.sol";
import "../core/CoreProperties.sol";
import "../core/Globals.sol";
import "../core/PriceFeed.sol";

contract TraderPoolFactory is ITraderPoolFactory, OwnableUpgradeable, AbstractDependant {
    address internal _contractsRegistry;
    TraderPoolRegistry internal _traderPoolRegistry;
    PriceFeed internal _priceFeed;
    CoreProperties internal _coreProperties;

    event Deployed(
        string poolType,
        string symbol,
        string name,
        address at,
        address proposalContract,
        address trader,
        address basicToken,
        string descriptionURL
    );

    function __TraderPoolFactory_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(address contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _traderPoolRegistry = TraderPoolRegistry(registry.getTraderPoolRegistryContract());
        _priceFeed = PriceFeed(registry.getPriceFeedContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
    }

    function _deploy(string memory name) internal returns (address proxy) {
        proxy = address(new BeaconProxy(_traderPoolRegistry.getProxyBeacon(name), ""));
    }

    function _deployTraderPool(string memory name) internal returns (address proxy) {
        proxy = _deploy(name);

        _traderPoolRegistry.addPool(_msgSender(), name, proxy);
    }

    function _injectDependencies(address proxy) internal {
        AbstractDependant(proxy).setDependencies(_contractsRegistry);
        AbstractDependant(proxy).setInjector(address(_traderPoolRegistry));
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external override {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_traderPoolRegistry.BASIC_POOL_NAME());
        address proposalProxy = _deploy(_traderPoolRegistry.RISKY_PROPOSAL_NAME());

        BasicTraderPool(poolProxy).__BasicTraderPool_init(
            name,
            symbol,
            poolParameters,
            proposalProxy
        );

        TraderPoolRiskyProposal(proposalProxy).__TraderPoolRiskyProposal_init(
            ITraderPoolProposal.ParentTraderPoolInfo(
                poolProxy,
                poolParameters.trader,
                poolParameters.baseToken,
                poolParameters.baseTokenDecimals
            )
        );

        _injectDependencies(poolProxy);

        emit Deployed(
            _traderPoolRegistry.BASIC_POOL_NAME(),
            symbol,
            name,
            poolProxy,
            proposalProxy,
            poolParameters.trader,
            poolParameters.baseToken,
            poolParameters.descriptionURL
        );
    }

    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external override {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_traderPoolRegistry.INVEST_POOL_NAME());
        address proposalProxy = _deploy(_traderPoolRegistry.INVEST_PROPOSAL_NAME());

        InvestTraderPool(poolProxy).__InvestTraderPool_init(
            name,
            symbol,
            poolParameters,
            proposalProxy
        );

        TraderPoolInvestProposal(proposalProxy).__TraderPoolInvestProposal_init(
            ITraderPoolProposal.ParentTraderPoolInfo(
                poolProxy,
                poolParameters.trader,
                poolParameters.baseToken,
                poolParameters.baseTokenDecimals
            )
        );

        _injectDependencies(poolProxy);

        emit Deployed(
            _traderPoolRegistry.INVEST_POOL_NAME(),
            symbol,
            name,
            poolProxy,
            proposalProxy,
            poolParameters.trader,
            poolParameters.baseToken,
            poolParameters.descriptionURL
        );
    }

    function _validateAndConstructParameters(PoolDeployParameters calldata poolDeployParameters)
        internal
        view
        returns (ITraderPool.PoolParameters memory poolParameters)
    {
        (uint256 general, uint256[] memory byPeriod) = _coreProperties.getTraderCommissions();

        require(
            poolDeployParameters.trader != address(0),
            "TraderPoolFactory: invalid trader address"
        );
        require(
            _priceFeed.isSupportedBaseToken(poolDeployParameters.baseToken),
            "TraderPoolFactory: Unsupported token"
        );
        require(
            poolDeployParameters.commissionPercentage >= general &&
                poolDeployParameters.commissionPercentage <=
                byPeriod[uint256(poolDeployParameters.commissionPeriod)],
            "TraderPoolFactory: Incorrect percentage"
        );

        poolParameters = ITraderPool.PoolParameters(
            poolDeployParameters.descriptionURL,
            poolDeployParameters.trader,
            poolDeployParameters.privatePool,
            poolDeployParameters.totalLPEmission,
            poolDeployParameters.baseToken,
            ERC20(poolDeployParameters.baseToken).decimals(),
            poolDeployParameters.minimalInvestment,
            poolDeployParameters.commissionPeriod,
            poolDeployParameters.commissionPercentage
        );
    }
}
