// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolProposal.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * This is the proposal the trader is able to create for the TraderInvestPool. The proposal itself is a subpool where investors
 * can send funds to. These funds become fully controlled by the trader himself and might be withdrawn for any purposes.
 * Anyone can supply funds to this kind of proposal and the funds will be distributed proportionally between all the proposal
 * investors
 */
interface ITraderPoolInvestProposal is ITraderPoolProposal {
    /// @notice The limits of this proposal
    /// @param timestampLimit the timestamp after which the proposal will close for the investments
    /// @param investLPLimit the maximal invested amount of LP tokens after which the proposal will close
    struct ProposalLimits {
        uint256 timestampLimit;
        uint256 investLPLimit;
    }

    /// @notice The struct that stores information about the proposal
    /// @param descriptionURL the IPFS URL of the proposal's description
    /// @param proposalLimits the limits of this proposal
    /// @param lpLocked the amount of LP tokens that are locked in this proposal
    /// @param investedBase the total amount of currently invested base tokens (this should never decrease because we don't burn LP)
    /// @param newInvestedBase the total amount of newly invested base tokens that the trader can withdraw
    struct ProposalInfo {
        string descriptionURL;
        ProposalLimits proposalLimits;
        uint256 lpLocked;
        uint256 investedBase;
        uint256 newInvestedBase;
    }

    /// @notice The struct that holds extra information about this proposal
    /// @param proposalInfo the information about this proposal
    /// @param lp2Supply the total supply of LP2 tokens
    /// @param totalInvestors the number of investors currently in this proposal
    struct ProposalInfoExtended {
        ProposalInfo proposalInfo;
        uint256 lp2Supply;
        uint256 totalInvestors;
    }

    /// @param cumulativeSums the helper values per rewarded token needed to calculate the investors' rewards
    /// @param rewardToken the set of rewarded token addresses
    struct RewardInfo {
        mapping(address => uint256) cumulativeSums; // with PRECISION
        EnumerableSet.AddressSet rewardTokens;
    }

    /// @notice The struct that stores the reward info about a single investor
    /// @param rewardsStored the amount of tokens the investor earned per rewarded token
    /// @param cumulativeSumsStored the helper variable needed to calculate investor's rewards per rewarded tokens
    struct UserRewardInfo {
        mapping(address => uint256) rewardsStored;
        mapping(address => uint256) cumulativeSumsStored; // with PRECISION
    }

    /// @notice The struct that is used by the TraderPoolInvestProposalView contract. It stores the information about
    /// currently active investor's proposals
    /// @param proposalId the id of the proposal
    /// @param lp2Balance investor's balance of proposal's LP tokens
    /// @param baseInvested the amount of invested base tokens by investor
    /// @param lpInvested the amount of invested LP tokens by investor
    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lp2Balance;
        uint256 baseInvested;
        uint256 lpInvested;
    }

    /// @notice The struct that stores information about values of corresponding token addresses, used in the
    /// TraderPoolInvestProposalView contract
    /// @param amounts the amounts of underlying tokens
    /// @param tokens the correspoding token addresses
    struct Reception {
        uint256[] amounts;
        address[] tokens;
    }

    /// @notice The struct that is used by the TraderPoolInvestProposalView contract. It stores the information
    /// about the rewards
    /// @param totalBaseAmount is the overall value of reward tokens in usd (might not be correct due to limitations of pathfinder)
    /// @param totalBaseAmount is the overall value of reward tokens in base token (might not be correct due to limitations of pathfinder)
    /// @param baseAmountFromRewards the amount of base tokens that can be reinvested into the parent pool
    /// @param rewards the array of amounts and addresses of rewarded tokens (containts base tokens)
    struct Receptions {
        uint256 totalUsdAmount;
        uint256 totalBaseAmount;
        uint256 baseAmountFromRewards;
        Reception[] rewards;
    }

    /// @notice The function to change the proposal limits
    /// @param proposalId the id of the proposal to change
    /// @param proposalLimits the new limits for this proposal
    function changeProposalRestrictions(
        uint256 proposalId,
        ProposalLimits calldata proposalLimits
    ) external;

    /// @notice The function that creates proposals
    /// @param descriptionURL the IPFS URL of proposal's description
    /// @param proposalLimits the certain limits of this proposal
    /// @param lpInvestment the amount of LP tokens invested on proposal's creation
    /// @param baseInvestment the equivalent amount of base tokens invested on proposal's creation
    /// @return proposalId the id of the created proposal
    function create(
        string calldata descriptionURL,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external returns (uint256 proposalId);

    /// @notice The function that is used to invest into the proposal
    /// @param proposalId the id of the proposal
    /// @param user the user that invests
    /// @param lpInvestment the amount of LP tokens the user invests
    /// @param baseInvestment the equivalent amount of base tokens the user invests
    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external;

    /// @notice The function that is used to divest profit into the main pool from the specified proposal
    /// @param proposalId the id of the proposal to divest from
    /// @param user the user who divests
    /// @return the received amount of base tokens
    function divest(uint256 proposalId, address user) external returns (uint256);

    /// @notice The trader function to withdraw the invested funds to his wallet
    /// @param proposalId The id of the proposal to withdraw the funds from
    /// @param amount the amount of base tokens to withdraw (normalized)
    function withdraw(uint256 proposalId, uint256 amount) external;

    /// @notice The function to supply reward to the investors
    /// @param proposalId the id of the proposal to supply the funds to
    /// @param amounts the amounts of tokens to be supplied (normalized)
    /// @param addresses the addresses of tokens to be supplied
    function supply(
        uint256 proposalId,
        uint256[] calldata amounts,
        address[] calldata addresses
    ) external;

    /// @notice The function to convert newly invested funds to the rewards
    /// @param proposalId the id of the proposal
    function convertInvestedBaseToDividends(uint256 proposalId) external;

    /// @notice The function to get the information about the proposals
    /// @param offset the starting index of the proposals array
    /// @param limit the number of proposals to observe
    /// @return proposals the information about the proposals
    function getProposalInfos(
        uint256 offset,
        uint256 limit
    ) external view returns (ProposalInfoExtended[] memory proposals);

    /// @notice The function to get the information about the active proposals of this user
    /// @param user the user to observe
    /// @param offset the starting index of the invested proposals array
    /// @param limit the number of proposals to observe
    /// @return investments the information about the currently active investments
    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments);

    /// @notice The function that is used to get user's rewards from the proposals
    /// @param proposalIds the array of proposals ids
    /// @param user the user to get rewards of
    /// @return receptions the information about the received rewards
    function getRewards(
        uint256[] calldata proposalIds,
        address user
    ) external view returns (Receptions memory receptions);
}
