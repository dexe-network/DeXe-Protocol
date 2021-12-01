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
import "../interfaces/trader/ITraderPoolRiskyProposal.sol";
import "../interfaces/trader/ITraderPoolInvestProposal.sol";

import "../trader/TraderPoolRegistry.sol";
import "../helpers/AbstractDependant.sol";
import "../core/CoreProperties.sol";
import "../core/Globals.sol";
import "../core/PriceFeed.sol";

contract TraderPoolFactory is ITraderPoolFactory, OwnableUpgradeable, AbstractDependant {
    IContractsRegistry internal _contractsRegistry;
    TraderPoolRegistry internal _traderPoolRegistry;
    PriceFeed internal _priceFeed;
    CoreProperties internal _coreProperties;

    event Deployed(address user, string poolName, address at);

    function __TraderPoolFactory_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;

        _traderPoolRegistry = TraderPoolRegistry(
            contractsRegistry.getTraderPoolRegistryContract()
        );
        _priceFeed = PriceFeed(contractsRegistry.getPriceFeedContract());
        _coreProperties = CoreProperties(contractsRegistry.getCorePropertiesContract());
    }

    function _deploy(string memory name) internal returns (address proxy) {
        proxy = address(new BeaconProxy(_traderPoolRegistry.getProxyBeacon(name), ""));

        emit Deployed(_msgSender(), name, proxy);
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
    ) external {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_traderPoolRegistry.BASIC_POOL_NAME());
        address proposalProxy = _deploy(_traderPoolRegistry.RISKY_PROPOSAL_NAME());

        IBasicTraderPool(poolProxy).__BasicTraderPool_init(
            name,
            symbol,
            poolParameters,
            proposalProxy
        );

        ITraderPoolRiskyProposal(proposalProxy).__TraderPoolRiskyProposal_init(
            ITraderPoolProposal.ParentTraderPoolInfo(
                poolProxy,
                poolParameters.trader,
                poolParameters.baseToken,
                poolParameters.baseTokenDecimals
            )
        );

        _injectDependencies(poolProxy);
    }

    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external {
        ITraderPool.PoolParameters memory poolParameters = _validateAndConstructParameters(
            poolDeployParameters
        );

        address poolProxy = _deployTraderPool(_traderPoolRegistry.INVEST_POOL_NAME());
        address proposalProxy = _deploy(_traderPoolRegistry.INVEST_PROPOSAL_NAME());

        IInvestTraderPool(poolProxy).__InvestTraderPool_init(
            name,
            symbol,
            poolParameters,
            proposalProxy
        );

        ITraderPoolInvestProposal(proposalProxy).__TraderPoolInvestProposal_init(
            ITraderPoolProposal.ParentTraderPoolInfo(
                poolProxy,
                poolParameters.trader,
                poolParameters.baseToken,
                poolParameters.baseTokenDecimals
            )
        );

        _injectDependencies(poolProxy);
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
