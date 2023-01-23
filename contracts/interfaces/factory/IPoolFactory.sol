// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../gov/settings/IGovSettings.sol";
import "../gov/proposals/ITokenSaleProposal.sol";
import "../gov/ERC20/IERC20Sale.sol";
import "../core/ICoreProperties.sol";

/**
 * This is the Factory contract for the trader and gov pools. Anyone can create a pool for themselves to become a trader
 * or a governance owner. There are 3 pools available: BasicTraderPool, InvestTraderPool and GovPool
 */
interface IPoolFactory {
    /// @notice General settings of the pool
    /// @param proposalSettings list of infos about settings for proposal types
    /// @param additionalProposalExecutors list of additional proposal executors
    struct SettingsDeployParams {
        IGovSettings.ProposalSettings[] proposalSettings;
        address[] additionalProposalExecutors;
    }

    /// @notice Parameters of validators
    /// @param name the name of a token used by validators
    /// @param symbol the symbol of a token used by validators
    /// @param duration the duration of voting (without the participation of the DAO pool) of validators in seconds
    /// @param quorum percentage of tokens from the token supply needed to reach a quorum
    /// @param validators list of the validator addresses
    /// @param balances list of initial token balances of the validators
    struct ValidatorsDeployParams {
        string name;
        string symbol;
        uint64 duration;
        uint128 quorum;
        address[] validators;
        uint256[] balances;
    }

    /// @notice Parameters of the user keeper
    /// @param tokenAddress address of the tokens used for voting
    /// @param nftAddress address of the NFT used for voting
    /// @param totalPowerInTokens the token equivalent of all NFTs
    /// @param nftsTotalSupply the NFT collection size
    struct UserKeeperDeployParams {
        address tokenAddress;
        address nftAddress;
        uint256 totalPowerInTokens;
        uint256 nftsTotalSupply;
    }

    /// @notice The pool deploy parameters
    /// @param settingsParams general settings of the pool
    /// @param validatorsParams parameters of validators
    /// @param userKeeperParams parameters of the user keeper
    /// @param nftMultiplierAddress the address of NFT multiplier
    /// @param verifier the address of the verifier
    /// @param onlyBABHolders if true, only KYCed users will be allowed to interact with the pool
    /// @param descriptionURL the description of the pool
    /// @param name the name of the pool
    struct GovPoolDeployParams {
        SettingsDeployParams settingsParams;
        ValidatorsDeployParams validatorsParams;
        UserKeeperDeployParams userKeeperParams;
        address nftMultiplierAddress;
        address verifier;
        bool onlyBABHolders;
        string descriptionURL;
        string name;
    }

    /// @notice The token sale proposal parameters
    /// @param tiersParams tiers parameters
    /// @param whitelistParams whitelisted users (for participation in tiers)
    /// @param tokenParams parameters of the token
    struct GovTokenSaleProposalDeployParams {
        ITokenSaleProposal.TierView[] tiersParams;
        ITokenSaleProposal.WhitelistingRequest[] whitelistParams;
        IERC20Sale.ConstructorParams tokenParams;
    }

    /// @notice The parameters one can specify on the trader pool's creation
    /// @param descriptionURL the IPFS URL of the pool description
    /// @param trader the trader of the pool
    /// @param privatePool the publicity of the pool
    /// @param onlyBABHolders if true, only KYCed users will be allowed to interact with the pool
    /// @param totalLPEmission maximal* emission of LP tokens that can be invested
    /// @param baseToken the address of the base token of the pool
    /// @param minimalInvestment the minimal allowed investment into the pool
    /// @param commissionPeriod the duration of the commission period
    /// @param commissionPercentage trader's commission percentage (including DEXE commission)
    struct TraderPoolDeployParameters {
        string descriptionURL;
        address trader;
        bool privatePool;
        bool onlyBABTHolders;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }

    /// @notice The function to deploy gov pools
    /// @param parameters the pool deploy parameters
    function deployGovPool(GovPoolDeployParams calldata parameters) external;

    /// @notice This function is used to deploy DAO Pool with TokenSale proposal
    /// @param parameters the pool deploy parameters
    /// @param tokenSaleParams the token sale proposal parameters
    function deployGovPoolWithTokenSale(
        GovPoolDeployParams calldata parameters,
        GovTokenSaleProposalDeployParams calldata tokenSaleParams
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

    /// @notice The view function that predicts the address where the gov pool proxy will be stored
    /// @param deployer the user that deploys the gov pool
    /// @param poolName the name of the pool which is part of the salt
    /// @return the predicted gov pool proxy address
    function predictGovAddress(
        address deployer,
        string calldata poolName
    ) external view returns (address);
}
