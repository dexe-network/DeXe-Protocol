// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@solarity/solidity-lib/contracts-registry/pools/pool-factory/AbstractPoolFactory.sol";

import "../interfaces/factory/IPoolFactory.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ISBT721.sol";

import {DistributionProposal} from "../gov/proposals/DistributionProposal.sol";
import {TokenSaleProposal} from "../gov/proposals/TokenSaleProposal.sol";
import {ERC721Expert} from "../gov/ERC721/ERC721Expert.sol";
import {ERC721Multiplier} from "../gov/ERC721/ERC721Multiplier.sol";
import "../gov/GovPool.sol";
import "../gov/user-keeper/GovUserKeeper.sol";
import "../gov/settings/GovSettings.sol";
import "../gov/validators/GovValidators.sol";

import "../core/CoreProperties.sol";
import {PoolRegistry} from "./PoolRegistry.sol";

import "../libs/factory/GovTokenDeployer.sol";

import "../core/Globals.sol";

contract PoolFactory is IPoolFactory, AbstractPoolFactory {
    using GovTokenDeployer for *;

    string internal constant EXPERT_NAME_POSTFIX = (" Expert Nft");
    string internal constant EXPERT_SYMBOL_POSTFIX = (" EXPNFT");

    string internal constant NFT_MULTIPLIER_NAME_POSTFIX = (" NFT Multiplier");
    string internal constant NFT_MULTIPLIER_SYMBOL_POSTFIX = (" MULTIPLIER");

    PoolRegistry internal _poolRegistry;
    CoreProperties internal _coreProperties;
    ISBT721 internal _babt;

    mapping(bytes32 => bool) private _usedSalts;

    event DaoPoolDeployed(
        string name,
        address govPool,
        address dp,
        address validators,
        address settings,
        address govUserKeeper,
        address localExpertNft,
        address nftMultiplier,
        address sender
    );
    event DaoTokenSaleDeployed(address govPool, address tokenSale, address token);

    function setDependencies(address contractsRegistry, bytes memory data) public override {
        super.setDependencies(contractsRegistry, data);

        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolRegistry = PoolRegistry(registry.getPoolRegistryContract());
        _coreProperties = CoreProperties(registry.getCorePropertiesContract());
        _babt = ISBT721(registry.getBABTContract());
    }

    function deployGovPool(GovPoolDeployParams calldata parameters) external override {
        string memory poolType = _poolRegistry.GOV_POOL_NAME();

        GovPool.Dependencies memory govPoolDeps;

        govPoolDeps.validatorsAddress = payable(_deploy(_poolRegistry.VALIDATORS_NAME()));
        govPoolDeps.userKeeperAddress = _deploy(_poolRegistry.USER_KEEPER_NAME());
        govPoolDeps.distributionAddress = _deploy(_poolRegistry.DISTRIBUTION_PROPOSAL_NAME());
        govPoolDeps.settingsAddress = _deploy(_poolRegistry.SETTINGS_NAME());
        address poolProxy = _deploy2(poolType, parameters.name);
        govPoolDeps.expertNftAddress = _deploy(_poolRegistry.EXPERT_NFT_NAME());
        govPoolDeps.nftMultiplierAddress = _deploy(_poolRegistry.NFT_MULTIPLIER_NAME());

        emit DaoPoolDeployed(
            parameters.name,
            poolProxy,
            govPoolDeps.distributionAddress,
            govPoolDeps.validatorsAddress,
            govPoolDeps.settingsAddress,
            govPoolDeps.userKeeperAddress,
            govPoolDeps.expertNftAddress,
            govPoolDeps.nftMultiplierAddress,
            msg.sender
        );

        _updateSalt(parameters.name);

        _initGovPool(poolProxy, govPoolDeps, parameters);

        GovSettings(govPoolDeps.settingsAddress).transferOwnership(poolProxy);
        GovUserKeeper(govPoolDeps.userKeeperAddress).transferOwnership(poolProxy);
        GovValidators(govPoolDeps.validatorsAddress).transferOwnership(poolProxy);
        ERC721Expert(govPoolDeps.expertNftAddress).transferOwnership(poolProxy);
        ERC721Multiplier(govPoolDeps.nftMultiplierAddress).transferOwnership(poolProxy);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);
    }

    function deployGovPoolWithTokenSale(
        GovPoolDeployParams calldata parameters,
        GovTokenSaleProposalDeployParams calldata tokenSaleParameters
    ) external override {
        string memory poolType = _poolRegistry.GOV_POOL_NAME();

        GovPool.Dependencies memory govPoolDeps;

        govPoolDeps.validatorsAddress = payable(_deploy(_poolRegistry.VALIDATORS_NAME()));
        govPoolDeps.userKeeperAddress = _deploy(_poolRegistry.USER_KEEPER_NAME());
        govPoolDeps.distributionAddress = _deploy(_poolRegistry.DISTRIBUTION_PROPOSAL_NAME());
        govPoolDeps.settingsAddress = _deploy(_poolRegistry.SETTINGS_NAME());
        address poolProxy = _deploy2(poolType, parameters.name);
        govPoolDeps.expertNftAddress = _deploy(_poolRegistry.EXPERT_NFT_NAME());
        govPoolDeps.nftMultiplierAddress = _deploy(_poolRegistry.NFT_MULTIPLIER_NAME());

        emit DaoPoolDeployed(
            parameters.name,
            poolProxy,
            govPoolDeps.distributionAddress,
            govPoolDeps.validatorsAddress,
            govPoolDeps.settingsAddress,
            govPoolDeps.userKeeperAddress,
            govPoolDeps.expertNftAddress,
            govPoolDeps.nftMultiplierAddress,
            msg.sender
        );

        address tokenSaleProxy = _deployTokenSale(parameters, tokenSaleParameters, poolProxy);

        emit DaoTokenSaleDeployed(
            poolProxy,
            tokenSaleProxy,
            parameters.userKeeperParams.tokenAddress
        );

        _updateSalt(parameters.name);

        TokenSaleProposal(tokenSaleProxy).createTiers(tokenSaleParameters.tiersParams);
        TokenSaleProposal(tokenSaleProxy).addToWhitelist(tokenSaleParameters.whitelistParams);

        _initGovPool(poolProxy, govPoolDeps, parameters);
        TokenSaleProposal(tokenSaleProxy).__TokenSaleProposal_init(poolProxy);

        GovSettings(govPoolDeps.settingsAddress).transferOwnership(poolProxy);
        GovUserKeeper(govPoolDeps.userKeeperAddress).transferOwnership(poolProxy);
        GovValidators(govPoolDeps.validatorsAddress).transferOwnership(poolProxy);
        ERC721Expert(govPoolDeps.expertNftAddress).transferOwnership(poolProxy);
        ERC721Multiplier(govPoolDeps.nftMultiplierAddress).transferOwnership(poolProxy);

        _register(poolType, poolProxy);
        _injectDependencies(poolProxy);
    }

    function predictGovAddresses(
        address deployer,
        string calldata poolName
    ) external view override returns (address, address, address) {
        if (bytes(poolName).length == 0) {
            return (address(0), address(0), address(0));
        }

        PoolRegistry poolRegistry = _poolRegistry;
        bytes32 govSalt = _calculateGovSalt(deployer, poolName);

        return (
            _predictPoolAddress(address(poolRegistry), poolRegistry.GOV_POOL_NAME(), govSalt),
            _predictPoolAddress(
                address(poolRegistry),
                poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
                govSalt
            ),
            govSalt.predictTokenAddress()
        );
    }

    function _deployTokenSale(
        GovPoolDeployParams calldata parameters,
        GovTokenSaleProposalDeployParams calldata tokenSaleParameters,
        address poolProxy
    ) internal returns (address tokenSaleProxy) {
        tokenSaleProxy = _deploy2(_poolRegistry.TOKEN_SALE_PROPOSAL_NAME(), parameters.name);
        _injectDependencies(tokenSaleProxy);

        bytes32 govSalt = _calculateGovSalt(tx.origin, parameters.name);

        if (parameters.userKeeperParams.tokenAddress == govSalt.predictTokenAddress()) {
            poolProxy.deployToken(tokenSaleProxy, govSalt, tokenSaleParameters.tokenParams);
        }
    }

    function _initGovPool(
        address poolProxy,
        GovPool.Dependencies memory govPoolDeps,
        GovPoolDeployParams calldata parameters
    ) internal {
        uint256 babtId;

        if (_babt.balanceOf(msg.sender) > 0) {
            babtId = _babt.tokenIdOf(msg.sender);
        }

        GovValidators(govPoolDeps.validatorsAddress).__GovValidators_init(
            parameters.validatorsParams.name,
            parameters.validatorsParams.symbol,
            parameters.validatorsParams.proposalSettings,
            parameters.validatorsParams.validators,
            parameters.validatorsParams.balances
        );
        GovUserKeeper(govPoolDeps.userKeeperAddress).__GovUserKeeper_init(
            parameters.userKeeperParams.tokenAddress,
            parameters.userKeeperParams.nftAddress,
            parameters.userKeeperParams.totalPowerInTokens,
            parameters.userKeeperParams.nftsTotalSupply
        );
        DistributionProposal(payable(govPoolDeps.distributionAddress)).__DistributionProposal_init(
            poolProxy
        );
        GovSettings(govPoolDeps.settingsAddress).__GovSettings_init(
            address(poolProxy),
            address(govPoolDeps.validatorsAddress),
            address(govPoolDeps.userKeeperAddress),
            parameters.settingsParams.proposalSettings,
            parameters.settingsParams.additionalProposalExecutors
        );
        GovPool(payable(poolProxy)).__GovPool_init(
            govPoolDeps,
            parameters.regularVoteModifier,
            parameters.expertVoteModifier,
            parameters.verifier,
            parameters.onlyBABHolders,
            babtId,
            parameters.descriptionURL,
            parameters.name
        );
        ERC721Expert(govPoolDeps.expertNftAddress).__ERC721Expert_init(
            parameters.name.concatStrings(EXPERT_NAME_POSTFIX),
            parameters.name.concatStrings(EXPERT_SYMBOL_POSTFIX)
        );
        ERC721Multiplier(govPoolDeps.nftMultiplierAddress).__ERC721Multiplier_init(
            parameters.name.concatStrings(NFT_MULTIPLIER_NAME_POSTFIX),
            parameters.name.concatStrings(NFT_MULTIPLIER_SYMBOL_POSTFIX)
        );
    }

    function _deploy(string memory poolType) internal returns (address) {
        return _deploy(address(_poolRegistry), poolType);
    }

    function _deploy2(string memory poolType, string memory poolName) internal returns (address) {
        bytes32 salt = _calculateGovSalt(tx.origin, poolName);

        require(bytes(poolName).length != 0, "PoolFactory: pool name cannot be empty");
        require(!_usedSalts[salt], "PoolFactory: pool name is already taken");

        return _deploy2(address(_poolRegistry), poolType, salt);
    }

    function _updateSalt(string memory poolName) internal {
        _usedSalts[_calculateGovSalt(tx.origin, poolName)] = true;
    }

    function _register(string memory poolType, address poolProxy) internal {
        _register(address(_poolRegistry), poolType, poolProxy);
    }

    function _injectDependencies(address proxy) internal {
        _injectDependencies(address(_poolRegistry), proxy);
    }

    function _calculateGovSalt(
        address deployer,
        string memory poolName
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, poolName));
    }
}
