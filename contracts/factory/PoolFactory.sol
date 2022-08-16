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
import "../gov/proposals/DistributionProposal.sol";

import "../trader/BasicTraderPool.sol";
import "../trader/InvestTraderPool.sol";
import "../trader/TraderPoolRiskyProposal.sol";
import "../trader/TraderPoolInvestProposal.sol";

import "../core/CoreProperties.sol";
import "./PoolRegistry.sol";

import "../core/Globals.sol";

contract PoolFactory is IPoolFactory, AbstractPoolFactory {
    PoolRegistry internal _poolRegistry;

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

        _poolRegistry = PoolRegistry(registry.getPoolRegistryContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
    }

    function deployGovPool(bool withDistributionProposal, GovPoolDeployParams calldata parameters)
        external
        override
    {
        string memory poolType = _poolRegistry.GOV_POOL_NAME();

        address settingsProxy = _deploy(address(_poolRegistry), _poolRegistry.SETTINGS_NAME());
        address validatorsProxy;

        validatorsProxy = _deploy(address(_poolRegistry), _poolRegistry.VALIDATORS_NAME());

        GovValidators(validatorsProxy).__GovValidators_init(
            parameters.validatorsParams.name,
            parameters.validatorsParams.symbol,
            parameters.validatorsParams.duration,
            parameters.validatorsParams.quorum,
            parameters.validatorsParams.validators,
            parameters.validatorsParams.balances
        );

        address userKeeperProxy = _deploy(
            address(_poolRegistry),
            _poolRegistry.USER_KEEPER_NAME()
        );
        address poolProxy = _deploy(address(_poolRegistry), poolType);
        address dpProxy;

        if (withDistributionProposal) {
            dpProxy = _deploy(address(_poolRegistry), _poolRegistry.DISTRIBUTION_PROPOSAL_NAME());
            DistributionProposal(dpProxy).__DistributionProposal_init(poolProxy);
        }

        GovSettings(settingsProxy).__GovSettings_init(
            address(dpProxy),
            address(validatorsProxy),
            parameters.seetingsParams.internalProposalSetting,
            parameters.seetingsParams.distributionProposalSettings,
            parameters.seetingsParams.changeValidatorsBalancesSettings,
            parameters.seetingsParams.defaultProposalSetting
        );
        GovUserKeeper(userKeeperProxy).__GovUserKeeper_init(
            parameters.userKeeperParams.tokenAddress,
            parameters.userKeeperParams.nftAddress,
            parameters.userKeeperParams.totalPowerInTokens,
            parameters.userKeeperParams.nftsTotalSupply
        );

        GovPool(payable(poolProxy)).__GovPool_init(
            settingsProxy,
            userKeeperProxy,
            dpProxy,
            validatorsProxy,
            parameters.votesLimit,
            parameters.feePercentage,
            parameters.descriptionURL
        );

        GovSettings(settingsProxy).transferOwnership(poolProxy);
        GovUserKeeper(userKeeperProxy).transferOwnership(poolProxy);

        GovValidators(validatorsProxy).transferOwnership(poolProxy);

        GovPool(payable(poolProxy)).transferOwnership(parameters.owner);

        _register(address(_poolRegistry), poolType, poolProxy);

        _poolRegistry.associateUserWithPool(parameters.owner, poolType, poolProxy);
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external override {
        string memory poolType = _poolRegistry.BASIC_POOL_NAME();
        ITraderPool.PoolParameters
            memory poolParameters = _validateAndConstructTraderPoolParameters(parameters);

        address proposalProxy = _deploy(
            address(_poolRegistry),
            _poolRegistry.RISKY_PROPOSAL_NAME()
        );
        address poolProxy = _deploy(address(_poolRegistry), poolType);

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

        _register(address(_poolRegistry), poolType, poolProxy);
        _injectDependencies(address(_poolRegistry), poolProxy);

        _poolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);

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
        string memory poolType = _poolRegistry.INVEST_POOL_NAME();
        ITraderPool.PoolParameters
            memory poolParameters = _validateAndConstructTraderPoolParameters(parameters);

        address proposalProxy = _deploy(
            address(_poolRegistry),
            _poolRegistry.INVEST_PROPOSAL_NAME()
        );
        address poolProxy = _deploy(address(_poolRegistry), poolType);

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

        _register(address(_poolRegistry), poolType, poolProxy);
        _injectDependencies(address(_poolRegistry), poolProxy);

        _poolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);

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
