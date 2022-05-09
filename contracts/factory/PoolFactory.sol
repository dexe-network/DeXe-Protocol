// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import "../interfaces/factory/IPoolFactory.sol";
import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/pool-contracts-registry/AbstractPoolContractsRegistry.sol";
import "../proxy/contracts-registry/AbstractDependant.sol";

import "../gov/GovPool.sol";
import "../gov/GovUserKeeper.sol";
import "../gov/settings/GovSettings.sol";
import "../gov/validators/GovValidators.sol";
import "../gov/GovPoolRegistry.sol";

import "../trader/BasicTraderPool.sol";
import "../trader/InvestTraderPool.sol";
import "../trader/TraderPoolRiskyProposal.sol";
import "../trader/TraderPoolInvestProposal.sol";
import "../trader/TraderPoolRegistry.sol";

import "../core/CoreProperties.sol";
import "../core/PriceFeed.sol";

import "../core/Globals.sol";

contract PoolFactory is IPoolFactory, AbstractDependant {
    address internal _contractsRegistry;

    TraderPoolRegistry internal _traderPoolRegistry;
    GovPoolRegistry internal _govPoolRegistry;

    PriceFeed internal _priceFeed;
    CoreProperties internal _coreProperties;

    event TraderPoolDeployed(
        string poolType,
        string symbol,
        string name,
        address at,
        address proposalContract,
        address trader,
        address basicToken,
        string descriptionURL
    );

    function setDependencies(address contractsRegistry) external override dependant {
        _contractsRegistry = contractsRegistry;

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _traderPoolRegistry = TraderPoolRegistry(registry.getTraderPoolRegistryContract());
        _govPoolRegistry = GovPoolRegistry(registry.getGovPoolRegistryContract());
        _priceFeed = PriceFeed(registry.getPriceFeedContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
    }

    function _deploy(address registry, string memory name) internal returns (address proxy) {
        proxy = address(
            new BeaconProxy(AbstractPoolContractsRegistry(registry).getProxyBeacon(name), "")
        );
    }

    function _injectDependencies(address registry, address proxy) internal {
        AbstractDependant(proxy).setDependencies(_contractsRegistry);
        AbstractDependant(proxy).setInjector(registry);
    }

    function deployGovPool(GovPoolDeployParams calldata parameters) external override {
        string memory poolType = _govPoolRegistry.GOV_POOL_NAME();

        address settingsProxy = _deploy(
            address(_govPoolRegistry),
            _govPoolRegistry.SETTINGS_NAME()
        );
        address validatorsProxy = _deploy(
            address(_govPoolRegistry),
            _govPoolRegistry.VALIDATORS_NAME()
        );
        address userKeeperProxy = _deploy(
            address(_govPoolRegistry),
            _govPoolRegistry.USER_KEEPER_NAME()
        );
        address poolProxy = _deploy(address(_govPoolRegistry), poolType);

        GovSettings(settingsProxy).__GovSettings_init(
            parameters.seetingsParams.internalProposalSetting,
            parameters.seetingsParams.defaultProposalSetting
        );
        GovUserKeeper(userKeeperProxy).__GovUserKeeper_init(
            parameters.userKeeperParams.tokenAddress,
            parameters.userKeeperParams.nftAddress,
            parameters.userKeeperParams.totalPowerInTokens,
            parameters.userKeeperParams.nftsTotalSupply
        );
        GovValidators(validatorsProxy).__GovValidators_init(
            parameters.validatorsParams.name,
            parameters.validatorsParams.symbol,
            parameters.validatorsParams.duration,
            parameters.validatorsParams.quorum,
            parameters.validatorsParams.validators,
            parameters.validatorsParams.balances
        );
        GovPool(payable(poolProxy)).__GovPool_init(
            settingsProxy,
            userKeeperProxy,
            validatorsProxy,
            parameters.votesLimit,
            parameters.feePercentage
        );

        GovPool(payable(poolProxy)).transferOwnership(parameters.owner);

        _govPoolRegistry.addPool(parameters.owner, poolType, poolProxy);
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external override {
        string memory poolType = _traderPoolRegistry.BASIC_POOL_NAME();
        ITraderPool.PoolParameters
            memory poolParameters = _validateAndConstructTraderPoolParameters(parameters);

        address proposalProxy = _deploy(
            address(_traderPoolRegistry),
            _traderPoolRegistry.RISKY_PROPOSAL_NAME()
        );
        address poolProxy = _deploy(address(_traderPoolRegistry), poolType);

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

        _traderPoolRegistry.addPool(poolParameters.trader, poolType, poolProxy);
        _injectDependencies(address(_traderPoolRegistry), poolProxy);

        emit TraderPoolDeployed(
            poolType,
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
        TraderPoolDeployParameters calldata parameters
    ) external override {
        string memory poolType = _traderPoolRegistry.INVEST_POOL_NAME();
        ITraderPool.PoolParameters
            memory poolParameters = _validateAndConstructTraderPoolParameters(parameters);

        address proposalProxy = _deploy(
            address(_traderPoolRegistry),
            _traderPoolRegistry.INVEST_PROPOSAL_NAME()
        );
        address poolProxy = _deploy(address(_traderPoolRegistry), poolType);

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

        _traderPoolRegistry.addPool(poolParameters.trader, poolType, poolProxy);
        _injectDependencies(address(_traderPoolRegistry), poolProxy);

        emit TraderPoolDeployed(
            poolType,
            symbol,
            name,
            poolProxy,
            proposalProxy,
            poolParameters.trader,
            poolParameters.baseToken,
            poolParameters.descriptionURL
        );
    }

    function _validateAndConstructTraderPoolParameters(
        TraderPoolDeployParameters calldata parameters
    ) internal view returns (ITraderPool.PoolParameters memory poolParameters) {
        (uint256 general, uint256[] memory byPeriod) = _coreProperties.getTraderCommissions();

        require(parameters.trader != address(0), "PoolFactory: invalid trader address");
        require(
            _priceFeed.isSupportedBaseToken(parameters.baseToken),
            "PoolFactory: Unsupported token"
        );
        require(
            parameters.commissionPercentage >= general &&
                parameters.commissionPercentage <= byPeriod[uint256(parameters.commissionPeriod)],
            "PoolFactory: Incorrect percentage"
        );

        poolParameters = ITraderPool.PoolParameters(
            parameters.descriptionURL,
            parameters.trader,
            parameters.privatePool,
            parameters.totalLPEmission,
            parameters.baseToken,
            ERC20(parameters.baseToken).decimals(),
            parameters.minimalInvestment,
            parameters.commissionPeriod,
            parameters.commissionPercentage
        );
    }
}
