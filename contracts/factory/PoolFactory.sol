// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@dlsl/dev-modules/pool-contracts-registry/pool-factory/AbstractPoolFactory.sol";

import "../interfaces/factory/IPoolFactory.sol";
import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ISBT721.sol";

import {DistributionProposal} from "../gov/proposals/DistributionProposal.sol";
import {TokenSaleProposal} from "../gov/proposals/TokenSaleProposal.sol";
import "../gov/GovPool.sol";
import "../gov/user-keeper/GovUserKeeper.sol";
import "../gov/settings/GovSettings.sol";
import "../gov/validators/GovValidators.sol";

import "../trader/BasicTraderPool.sol";
import "../trader/InvestTraderPool.sol";
import "../trader/TraderPoolRiskyProposal.sol";
import "../trader/TraderPoolInvestProposal.sol";

import "../core/CoreProperties.sol";
import "./PoolRegistry.sol";

import "../libs/factory/GovTokenSaleDeployer.sol";

import "../core/Globals.sol";

contract PoolFactory is IPoolFactory, AbstractPoolFactory {
    using GovTokenSaleDeployer for *;

    PoolRegistry internal _poolRegistry;
    CoreProperties internal _coreProperties;
    ISBT721 internal _babt;

    mapping(bytes32 => bool) private _usedSalts;

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
    event DaoPoolDeployed(
        string name,
        address govPool,
        address DP,
        address validators,
        address settings,
        address govUserKeeper,
        address sender
    );
    event DaoTokenSaleDeployed(address govPool, address tokenSale, address token);

    function setDependencies(address contractsRegistry) public override {
        super.setDependencies(contractsRegistry);

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolRegistry = PoolRegistry(registry.getPoolRegistryContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
        _babt = ISBT721(registry.getBABTContract());
    }

    function deployGovPool(GovPoolDeployParams calldata parameters) external override {
        string memory poolType = _poolRegistry.GOV_POOL_NAME();

        address validatorsProxy = _deploy(_poolRegistry.VALIDATORS_NAME());
        address userKeeperProxy = _deploy(_poolRegistry.USER_KEEPER_NAME());
        address dpProxy = _deploy(_poolRegistry.DISTRIBUTION_PROPOSAL_NAME());
        address settingsProxy = _deploy(_poolRegistry.SETTINGS_NAME());
        address poolProxy = _deploy2(poolType, parameters.name);

        emit DaoPoolDeployed(
            parameters.name,
            poolProxy,
            dpProxy,
            validatorsProxy,
            settingsProxy,
            userKeeperProxy,
            msg.sender
        );

        _initGovPool(
            poolProxy,
            settingsProxy,
            dpProxy,
            userKeeperProxy,
            validatorsProxy,
            parameters
        );

        GovSettings(settingsProxy).transferOwnership(poolProxy);
        GovUserKeeper(userKeeperProxy).transferOwnership(poolProxy);
        GovValidators(validatorsProxy).transferOwnership(poolProxy);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);
    }

    function deployGovPoolWithTokenSale(
        GovPoolDeployParams memory parameters,
        GovTokenSaleProposalDeployParams memory tokenSaleParameters
    ) external override {
        _validateGovPoolWithTokenSaleParameters(parameters);

        string memory poolType = _poolRegistry.GOV_POOL_NAME();

        address validatorsProxy = _deploy(_poolRegistry.VALIDATORS_NAME());
        address userKeeperProxy = _deploy(_poolRegistry.USER_KEEPER_NAME());
        address dpProxy = _deploy(_poolRegistry.DISTRIBUTION_PROPOSAL_NAME());
        address settingsProxy = _deploy(_poolRegistry.SETTINGS_NAME());
        address poolProxy = _deploy2(poolType, parameters.name);

        emit DaoPoolDeployed(
            parameters.name,
            poolProxy,
            dpProxy,
            validatorsProxy,
            settingsProxy,
            userKeeperProxy,
            msg.sender
        );

        address tokenSaleProxy = _deployTokenSale(parameters, tokenSaleParameters, poolProxy);

        emit DaoTokenSaleDeployed(
            poolProxy,
            tokenSaleProxy,
            parameters.userKeeperParams.tokenAddress
        );

        TokenSaleProposal(tokenSaleProxy).createTiers(tokenSaleParameters.tiersParams);
        TokenSaleProposal(tokenSaleProxy).addToWhitelist(tokenSaleParameters.whitelistParams);

        _initGovPool(
            poolProxy,
            settingsProxy,
            dpProxy,
            userKeeperProxy,
            validatorsProxy,
            parameters
        );
        TokenSaleProposal(tokenSaleProxy).__TokenSaleProposal_init(poolProxy);

        GovSettings(settingsProxy).transferOwnership(poolProxy);
        GovUserKeeper(userKeeperProxy).transferOwnership(poolProxy);
        GovValidators(validatorsProxy).transferOwnership(poolProxy);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);
    }

    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external override {
        string memory poolType = _poolRegistry.BASIC_POOL_NAME();
        ITraderPool.PoolParameters memory poolParameters = _validateTraderPoolParameters(
            parameters
        );

        address proposalProxy = _deploy(_poolRegistry.RISKY_PROPOSAL_NAME());
        address poolProxy = _deploy(poolType);

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

        _initBasicPool(poolProxy, proposalProxy, name, symbol, poolParameters);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);

        _poolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);
    }

    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external override {
        string memory poolType = _poolRegistry.INVEST_POOL_NAME();
        ITraderPool.PoolParameters memory poolParameters = _validateTraderPoolParameters(
            parameters
        );

        address proposalProxy = _deploy(_poolRegistry.INVEST_PROPOSAL_NAME());
        address poolProxy = _deploy(poolType);

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

        _initInvestPool(poolProxy, proposalProxy, name, symbol, poolParameters);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);

        _poolRegistry.associateUserWithPool(poolParameters.trader, poolType, poolProxy);
    }

    function predictGovAddress(
        address deployer,
        string calldata poolName
    ) external view override returns (address) {
        if (bytes(poolName).length == 0) {
            return address(0);
        }

        return
            _predictPoolAddress(
                address(_poolRegistry),
                _poolRegistry.GOV_POOL_NAME(),
                _calculateGovSalt(deployer, poolName)
            );
    }

    function _deployTokenSale(
        GovPoolDeployParams memory parameters,
        GovTokenSaleProposalDeployParams memory tokenSaleParameters,
        address poolProxy
    ) internal returns (address tokenSaleProxy) {
        tokenSaleProxy = _deploy(_poolRegistry.TOKEN_SALE_PROPOSAL_NAME());

        parameters.settingsParams.additionalProposalExecutors[0] = tokenSaleProxy;

        if (parameters.userKeeperParams.tokenAddress == address(0)) {
            parameters.userKeeperParams.tokenAddress = poolProxy.deploy(
                tokenSaleProxy,
                tokenSaleParameters.tokenParams
            );
        }

        address token = parameters.userKeeperParams.tokenAddress;

        for (uint256 i = 0; i < tokenSaleParameters.tiersParams.length; i++) {
            if (tokenSaleParameters.tiersParams[i].saleTokenAddress == address(0)) {
                tokenSaleParameters.tiersParams[i].saleTokenAddress = token;
            }
        }
    }

    function _initGovPool(
        address poolProxy,
        address settingsProxy,
        address dpProxy,
        address userKeeperProxy,
        address validatorsProxy,
        GovPoolDeployParams memory parameters
    ) internal {
        uint256 babtId;

        if (_babt.balanceOf(msg.sender) > 0) {
            babtId = _babt.tokenIdOf(msg.sender);
        }

        GovValidators(validatorsProxy).__GovValidators_init(
            parameters.validatorsParams.name,
            parameters.validatorsParams.symbol,
            parameters.validatorsParams.duration,
            parameters.validatorsParams.quorum,
            parameters.validatorsParams.validators,
            parameters.validatorsParams.balances,
            poolProxy
        );
        GovUserKeeper(userKeeperProxy).__GovUserKeeper_init(
            parameters.userKeeperParams.tokenAddress,
            parameters.userKeeperParams.nftAddress,
            parameters.userKeeperParams.totalPowerInTokens,
            parameters.userKeeperParams.nftsTotalSupply
        );
        DistributionProposal(payable(dpProxy)).__DistributionProposal_init(poolProxy);
        GovSettings(settingsProxy).__GovSettings_init(
            address(poolProxy),
            address(dpProxy),
            address(validatorsProxy),
            address(userKeeperProxy),
            parameters.settingsParams.proposalSettings,
            parameters.settingsParams.additionalProposalExecutors
        );
        GovPool(payable(poolProxy)).__GovPool_init(
            settingsProxy,
            userKeeperProxy,
            dpProxy,
            validatorsProxy,
            parameters.nftMultiplierAddress,
            parameters.verifier,
            parameters.onlyBABHolders,
            babtId,
            parameters.descriptionURL,
            parameters.name
        );
    }

    function _initBasicPool(
        address poolProxy,
        address proposalProxy,
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory poolParameters
    ) internal {
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
    }

    function _initInvestPool(
        address poolProxy,
        address proposalProxy,
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory poolParameters
    ) internal {
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
    }

    function _deploy(string memory poolType) internal returns (address) {
        return _deploy(address(_poolRegistry), poolType);
    }

    function _deploy2(string memory poolType, string memory poolName) internal returns (address) {
        require(bytes(poolName).length != 0, "PoolFactory: pool name cannot be empty");

        bytes32 salt = _calculateGovSalt(tx.origin, poolName);
        require(!_usedSalts[salt], "PoolFactory: pool name is already taken");

        _usedSalts[salt] = true;

        return _deploy2(address(_poolRegistry), poolType, salt);
    }

    function _register(string memory poolType, address poolProxy) internal {
        _register(address(_poolRegistry), poolType, poolProxy);
    }

    function _injectDependencies(address proxy) internal {
        _injectDependencies(address(_poolRegistry), proxy);
    }

    function _validateTraderPoolParameters(
        TraderPoolDeployParameters calldata parameters
    ) internal view returns (ITraderPool.PoolParameters memory poolParameters) {
        uint256 babtId;
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

        if (_babt.balanceOf(parameters.trader) > 0) {
            babtId = _babt.tokenIdOf(parameters.trader);
        }

        poolParameters = ITraderPool.PoolParameters(
            parameters.descriptionURL,
            parameters.trader,
            parameters.privatePool,
            ERC20(parameters.baseToken).decimals(),
            parameters.onlyBABTHolders,
            parameters.totalLPEmission,
            parameters.baseToken,
            parameters.minimalInvestment,
            parameters.commissionPeriod,
            parameters.commissionPercentage,
            babtId
        );
    }

    function _validateGovPoolWithTokenSaleParameters(
        GovPoolDeployParams memory parameters
    ) internal pure {
        require(
            parameters.settingsParams.proposalSettings.length > 4 &&
                parameters.settingsParams.additionalProposalExecutors.length > 0 &&
                parameters.settingsParams.additionalProposalExecutors[0] == address(0),
            "PoolFactory: invalid token sale executor"
        );
    }

    function _calculateGovSalt(
        address deployer,
        string memory poolName
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, poolName));
    }
}
