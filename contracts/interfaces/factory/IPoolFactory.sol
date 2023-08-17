// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../gov/settings/IGovSettings.sol";
import "../gov/validators/IGovValidators.sol";
import "../gov/proposals/ITokenSaleProposal.sol";
import "../gov/ERC20/IERC20Sale.sol";
import "../core/ICoreProperties.sol";

/**
 * This is the Factory contract for the gov pools. Anyone can create a pool for themselves to become
 * a governance owner (GovPool)
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
    /// @param proposalSettings struct with settings for proposals
    /// @param validators list of the validator addresses
    /// @param balances list of initial token balances of the validators
    struct ValidatorsDeployParams {
        string name;
        string symbol;
        IGovValidators.ProposalSettings proposalSettings;
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

    /// @notice The token sale proposal parameters
    /// @param tiersParams tiers parameters
    /// @param whitelistParams whitelisted users (for participation in tiers)
    /// @param tokenParams parameters of the token
    struct TokenSaleProposalDeployParams {
        ITokenSaleProposal.TierInitParams[] tiersParams;
        ITokenSaleProposal.WhitelistingRequest[] whitelistParams;
        IERC20Sale.ConstructorParams tokenParams;
    }

    /// @notice The pool deploy parameters
    /// @param settingsParams general settings of the pool
    /// @param validatorsParams parameters of validators
    /// @param userKeeperParams parameters of the user keeper
    /// @param tokenSaleParams the token sale proposal parameters
    /// @param regularVoteModifier voting parameter for regular users
    /// @param expertVoteModifier voting parameter for experts
    /// @param verifier the address of the verifier
    /// @param onlyBABHolders if true, only KYCed users will be allowed to interact with the pool
    /// @param descriptionURL the description of the pool
    /// @param name the name of the pool
    struct GovPoolDeployParams {
        SettingsDeployParams settingsParams;
        ValidatorsDeployParams validatorsParams;
        UserKeeperDeployParams userKeeperParams;
        TokenSaleProposalDeployParams tokenSaleParams;
        uint256 regularVoteModifier;
        uint256 expertVoteModifier;
        address verifier;
        bool onlyBABHolders;
        string descriptionURL;
        string name;
    }

    struct GovPoolPredictedAddresses {
        address govPool;
        address govToken;
        address govTokenSale;
        address distributionProposal;
        address expertNft;
        address nftMultiplier;
    }

    /// @notice This function is used to deploy DAO Pool with TokenSale proposal
    /// @param parameters the pool deploy parameters
    function deployGovPoolWithTokenSale(GovPoolDeployParams calldata parameters) external;

    /// @notice The view function that predicts the addresses where
    /// the gov pool proxy, the gov token sale proxy and the gov token will be stored
    /// @param deployer the user that deploys the gov pool (tx.origin)
    /// @param poolName the name of the pool which is part of the salt
    /// @return the predicted addresses
    function predictGovAddresses(
        address deployer,
        string calldata poolName
    ) external view returns (GovPoolPredictedAddresses memory);
}
