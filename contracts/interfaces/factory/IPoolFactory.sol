// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../gov/settings/IGovSettings.sol";
import "../core/ICoreProperties.sol";

/**
 * This is the Factory contract for the trader and gov pools. Anyone can create a pool for themselves to become a trader
 * or a governance owner. There are 3 pools available: BasicTraderPool, InvestTraderPool and GovPool
 */
interface IPoolFactory {
    struct SettingsDeployParams {
        IGovSettings.ProposalSettings internalProposalSetting;
        IGovSettings.ProposalSettings distributionProposalSettings;
        IGovSettings.ProposalSettings defaultProposalSetting;
    }

    struct ValidatorsDeployParams {
        string name;
        string symbol;
        uint64 duration;
        uint128 quorum;
        address[] validators;
        uint256[] balances;
    }

    struct UserKeeperDeployParams {
        address tokenAddress;
        address nftAddress;
        uint256 totalPowerInTokens;
        uint256 nftsTotalSupply;
    }

    struct GovPoolDeployParams {
        SettingsDeployParams seetingsParams;
        ValidatorsDeployParams validatorsParams;
        UserKeeperDeployParams userKeeperParams;
        address owner;
        uint256 votesLimit;
        uint256 feePercentage;
        string descriptionURL;
    }

    /// @notice The parameters one can specify on the trader pool's creation
    /// @param descriptionURL the IPFS URL of the pool description
    /// @param trader the trader of the pool
    /// @param privatePool the publicity of the pool
    /// @param totalLPEmission maximal* emission of LP tokens that can be invested
    /// @param baseToken the address of the base token of the pool
    /// @param minimalInvestment the minimal allowed investment into the pool
    /// @param commissionPeriod the duration of the commission period
    /// @param commissionPercentage trader's commission percentage (including DEXE commission)
    struct TraderPoolDeployParameters {
        string descriptionURL;
        address trader;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }

    /// @notice The function to deploy gov pools
    /// @param withValidators if true deploys gov pool with validators
    /// @param parameters the pool deploy parameters
    function deployGovPool(
        bool withValidators,
        bool withDistributionProposal,
        GovPoolDeployParams calldata parameters
    ) external;

    /// @notice The function to deploy basic pools
    /// @param name the ERC20 name of the pool
    /// @param symbol the ERC20 symbol of the pool
    /// @param parameters the pool deploy parameters
    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external;

    /// @notice The function to deploy invest pools
    /// @param name the ERC20 name of the pool
    /// @param symbol the ERC20 symbol of the pool
    /// @param parameters the pool deploy parameters
    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        TraderPoolDeployParameters calldata parameters
    ) external;
}
