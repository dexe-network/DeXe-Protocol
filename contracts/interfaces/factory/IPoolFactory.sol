// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../gov/settings/IGovSettings.sol";
import "../gov/validators/IGovValidators.sol";
import "../gov/proposals/ITokenSaleProposal.sol";
import "../gov/ERC20/IERC20Gov.sol";
import "../core/ICoreProperties.sol";

/**
 * This is the Factory contract for the gov pools. Anyone can create a pool for themselves to become
 * a governance owner (GovPool)
 */
interface IPoolFactory {
    /// @notice The enum that holds information about calculating vote power
    /// @param LINEAR_VOTES the vote power = number of tokens
    /// @param ROOT_VOTES the vote power calculated with root formula
    /// @param CUSTOM_VOTES the vote type defined by a customer
    enum VotePowerType {
        LINEAR_VOTES,
        ROOT_VOTES,
        CUSTOM_VOTES
    }

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
        IERC20Gov.ConstructorParams tokenParams;
    }

    /// @notice The voting power parameters
    /// @param voteType type of algorythm to calculate votes number from token number
    /// @param initData initialization data for standard contract types
    /// @param presetAddress address of custom contract (for custom voteType)
    struct VotePowerDeployParams {
        VotePowerType voteType;
        bytes initData;
        address presetAddress;
    }

    /// @notice The pool deploy parameters
    /// @param settingsParams general settings of the pool
    /// @param validatorsParams parameters of validators
    /// @param userKeeperParams parameters of the user keeper
    /// @param tokenSaleParams the token sale proposal parameters
    /// @param votePowerParams vote power parameters
    /// @param verifier the address of the verifier
    /// @param onlyBABHolders if true, only KYCed users will be allowed to interact with the pool
    /// @param descriptionURL the description of the pool
    /// @param name the name of the pool
    struct GovPoolDeployParams {
        SettingsDeployParams settingsParams;
        ValidatorsDeployParams validatorsParams;
        UserKeeperDeployParams userKeeperParams;
        TokenSaleProposalDeployParams tokenSaleParams;
        VotePowerDeployParams votePowerParams;
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
    function deployGovPool(GovPoolDeployParams calldata parameters) external;

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
