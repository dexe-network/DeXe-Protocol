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
import "../interfaces/trader/ITraderPoolProposal.sol";

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
    }

    function _deploy(string memory name) internal returns (address proxy) {
        proxy = address(new BeaconProxy(_poolRegistry.getProxyBeacon(name), ""));

        AbstractDependant(proxy).setDependencies(_contractsRegistry);
        AbstractDependant(proxy).setInjector(address(_poolRegistry));

        emit Deployed(_msgSender(), name, proxy);
    }

    function _deployTraderPool(string memory name) internal returns (address proxy) {
        proxy = _deploy(name);
        _poolRegistry.addPool(_msgSender(), name, proxy);
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_poolRegistry.BASIC_POOL_NAME());
        address proposalProxy = _deploy(_poolRegistry.PROPOSAL_NAME());

        IBasicTraderPool(poolProxy).__BasicTraderPool_init(
            name,
            symbol,
            poolParameters,
            proposalProxy
        );

        ITraderPoolProposal(proposalProxy).__TraderPoolProposal_init(
            ITraderPoolProposal.ParentTraderPoolInfo(
                poolProxy,
                poolParameters.trader,
                poolParameters.baseToken,
                poolParameters.baseTokenDecimals
            )
        );
    }

    function deployRiskyPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_poolRegistry.RISKY_POOL_NAME());

        IRiskyTraderPool(poolProxy).__RiskyTraderPool_init(name, symbol, poolParameters);
    }

    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_poolRegistry.INVEST_POOL_NAME());

        IInvestTraderPool(poolProxy).__InvestTraderPool_init(name, symbol, poolParameters);
    }

    function _validateAndConstructParameters(PoolDeployParameters calldata poolDeployParameters)
        internal
        view
        returns (ITraderPool.PoolParameters memory poolParameters)
    {
        (uint256 general, uint256[] memory byPeriod) = _coreProperties.getTraderCommissions();

        require(
            _priceFeed.isSupportedBaseToken(poolDeployParameters.baseToken),
            "TraderPoolFactory: Unsupported token."
        );

        require(
            poolDeployParameters.commissionPercentage >= general &&
                poolDeployParameters.commissionPercentage <=
                byPeriod[uint256(poolDeployParameters.commissionPeriod)],
            "TraderPoolFactory: Incorrect percentage."
        );

        poolParameters = ITraderPool.PoolParameters(
            poolDeployParameters.descriptionURL,
            _msgSender(),
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
