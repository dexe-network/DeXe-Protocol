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

    /// @param cumulativeSum the helper value needed to calculate the investors' rewards
    struct RewardInfo {
        mapping(address => uint256) cumulativeSums; // with PRECISION
        EnumerableSet.AddressSet rewardTokens;
    }

    /// @notice The struct that stores the info about a single investor
    /// @param rewardsStored the amount of base tokens the investor earned
    /// @param cumulativeSumStored the helper variable needed to calculate investor's rewards
    struct UserRewardInfo {
        mapping(address => uint256) rewardsStored;
        mapping(address => uint256) cumulativeSumsStored; // with PRECISION
    }

    /// @notice The struct that is used by the TraderPoolInvestProposalView contract. It stores the information about
    /// currently active investor's proposals
    /// @param proposalId the id of the proposal
    /// @param lp2Balance investor's balance of proposal's LP tokens
    /// @param lpLocked the investor's amount of locked LP tokens
    /// @param reward the currently available reward in base tokens
    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lp2Balance;
        uint256 lpLocked;
    }

    struct Reception {
        uint256[] amounts;
        address[] tokens;
    }

    /// @notice The struct that is used by the TraderPoolInvestProposalView contract. It stores the information
    /// about the rewards
    /// @param receivedBaseAmounts the array of received base tokens per proposals
    struct Receptions {
        uint256 baseAmount;
        Reception[] rewards;
    }

    /// @notice The function to change the proposal limits
    /// @param proposalId the id of the proposal to change
    /// @param proposalLimits the new limits for this proposal
    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external;

    /// @notice The function to get the information about the proposals
    /// @param offset the starting index of the proposals array
    /// @param limit the number of proposals to observe
    /// @return proposals the information about the proposals
    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalInfo[] memory proposals);

    /// @notice The function to get the information about the active proposals of this user
    /// @param user the user to observe
    /// @param offset the starting index of the users array
    /// @param limit the number of users to observe
    /// @return investments the information about the currently active investments
    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments);

    /// @notice The function that creates proposals
    /// @param descriptionURL the IPFS URL of new description
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

    /// @notice The function that is used to get user's rewards from the proposals
    /// @param proposalIds the array of proposals ids
    /// @param user the user to get rewards of
    /// @return receptions the information about the received rewards
    function getRewards(uint256[] calldata proposalIds, address user)
        external
        view
        returns (Receptions memory receptions);

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

    /// @notice The function to divest profit from all the active proposals into the main pool
    /// @param user the user who divests
    /// @return the amount of base tokens received
    function divestAll(address user) external returns (uint256);

    /// @notice The function used to claim the proposal's profit to the msg.sender wallet
    /// @param proposalId the id of the proposal
    function claim(uint256 proposalId) external;

    /// @notice The function to claim all the active proposals' profit to the msg.sender wallet
    function claimAll() external;

    /// @notice The trader function to withdraw the invested funds to his wallet
    /// @param proposalId The id of the proposal to withdraw the funds from
    /// @param amount the amount of base tokens to withdraw (normalized)
    function withdraw(uint256 proposalId, uint256 amount) external;

    /// @notice The function to convert newly invested funds to the rewards
    /// @param proposalId the id of the proposal
    function convertInvestedBaseToDividends(uint256 proposalId) external;

    /// @notice The function to supply reward to the investors
    /// @param proposalId the id of the proposal to supply the funds to
    /// @param amounts the amounts of tokens to be supplied (normalized)
    /// @param addresses the addresses of tokens to be supplied
    function supply(
        uint256 proposalId,
        uint256[] calldata amounts,
        address[] calldata addresses
    ) external;
}
