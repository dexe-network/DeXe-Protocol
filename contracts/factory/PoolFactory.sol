// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/factory/IPoolFactory.sol";
import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "@dlsl/dev-modules/pool-contracts-registry/pool-factory/AbstractPoolFactory.sol";

import "../gov/GovPool.sol";
import "../gov/user-keeper/GovUserKeeper.sol";
import "../gov/settings/GovSettings.sol";
import "../gov/validators/GovValidators.sol";
import "../gov/GovPoolRegistry.sol";

import "../trader/BasicTraderPool.sol";
import "../trader/InvestTraderPool.sol";
import "../trader/TraderPoolRiskyProposal.sol";
import "../trader/TraderPoolInvestProposal.sol";
import "../trader/TraderPoolRegistry.sol";

import "../core/CoreProperties.sol";

import "../core/Globals.sol";

contract PoolFactory is IPoolFactory, AbstractPoolFactory {
    TraderPoolRegistry internal _traderPoolRegistry;
    GovPoolRegistry internal _govPoolRegistry;

    CoreProperties internal _coreProperties;

    event TraderPoolDeployed(
        string poolType,
        string symbol,
        string name,
        address at,
        address proposalContract,
        address trader,
        address basicToken,
        uint256 commission,
        string descriptionURL
    );

    function setDependencies(address contractsRegistry) public override {
        super.setDependencies(contractsRegistry);

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _traderPoolRegistry = TraderPoolRegistry(registry.getTraderPoolRegistryContract());
        _govPoolRegistry = GovPoolRegistry(registry.getGovPoolRegistryContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
    }

    function deployGovPool(bool withValidators, GovPoolDeployParams calldata parameters)
        external
        override
    {
        string memory poolType = _govPoolRegistry.GOV_POOL_NAME();

        address settingsProxy = _deploy(
            address(_govPoolRegistry),
            _govPoolRegistry.SETTINGS_NAME()
        );
        address validatorsProxy;

        if (withValidators) {
            validatorsProxy = _deploy(
                address(_govPoolRegistry),
                _govPoolRegistry.VALIDATORS_NAME()
            );
        }

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

        if (withValidators) {
            GovValidators(validatorsProxy).__GovValidators_init(
                parameters.validatorsParams.name,
                parameters.validatorsParams.symbol,
                parameters.validatorsParams.duration,
                parameters.validatorsParams.quorum,
                parameters.validatorsParams.validators,
                parameters.validatorsParams.balances
            );
        }

        GovPool(payable(poolProxy)).__GovPool_init(
            settingsProxy,
            userKeeperProxy,
            validatorsProxy,
            parameters.votesLimit,
            parameters.feePercentage,
            parameters.descriptionURL
        );

        GovSettings(settingsProxy).transferOwnership(poolProxy);
        GovUserKeeper(userKeeperProxy).transferOwnership(poolProxy);

        if (withValidators) {
            GovValidators(validatorsProxy).transferOwnership(poolProxy);
        }

        GovPool(payable(poolProxy)).transferOwnership(parameters.owner);

        _register(address(_govPoolRegistry), poolType, poolProxy);

        _govPoolRegistry.associateUserWithPool(parameters.owner, poolType, poolProxy);
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

        _register(address(_traderPoolRegistry), poolType, poolProxy);
        _injectDependencies(address(_traderPoolRegistry), poolProxy);

        _traderPoolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);

        emit TraderPoolDeployed(
            poolType,
            symbol,
            name,
            poolProxy,
            proposalProxy,
            poolParameters.trader,
            poolParameters.baseToken,
            poolParameters.commissionPercentage,
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

        _register(address(_traderPoolRegistry), poolType, poolProxy);
        _injectDependencies(address(_traderPoolRegistry), poolProxy);

        _traderPoolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);

        emit TraderPoolDeployed(
            poolType,
            symbol,
            name,
            poolProxy,
            proposalProxy,
            poolParameters.trader,
            poolParameters.baseToken,
            poolParameters.commissionPercentage,
            poolParameters.descriptionURL
        );
    }

    function _validateAndConstructTraderPoolParameters(
        TraderPoolDeployParameters calldata parameters
    ) internal view returns (ITraderPool.PoolParameters memory poolParameters) {
        (uint256 general, uint256[] memory byPeriod) = _coreProperties.getTraderCommissions();

        require(parameters.trader != address(0), "PoolFactory: invalid trader address");
        require(
            !_coreProperties.isBlacklistedToken(parameters.baseToken),
            "PoolFactory: token is blacklisted"
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
