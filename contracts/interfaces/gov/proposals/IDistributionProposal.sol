// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract the governance can execute in order to distribute rewards proportionally among
 * all the voters who participated in the certain proposal
 */
interface IDistributionProposal {
    /// @notice The struct holds information about distribution proposal
    /// @param rewardAddress the address of reward token
    /// @param rewardAmount the total amount of rewards
    /// @param claimed mapping, that indicates whether the user has claimed the rewards
    struct DistributionProposalStruct {
        address rewardAddress;
        uint256 rewardAmount;
        mapping(address => bool) claimed;
    }

    /// @notice This event is emitted when a new distribution proposal is created
    /// @param proposalId the id of the proposal
    /// @param sender the address of the sender
    /// @param amount the total amount of rewards
    event DistributionProposalClaimed(uint256 proposalId, address sender, uint256 amount);

    /// @notice The function to initialize the contract
    /// @param _govAddress the address of the governance contract
    function __DistributionProposal_init(address _govAddress) external;

    /// @notice Executed by `Gov` contract, creates a DP
    /// @param proposalId the id of distribution proposal in Gov pool
    /// @param token the rewards token address
    /// @param amount the total amount of rewards
    function execute(uint256 proposalId, address token, uint256 amount) external payable;

    /// @notice Claims distribution proposal rewards
    /// @param voter Voter address
    /// @param proposalIds the array of proposal ids
    function claim(address voter, uint256[] calldata proposalIds) external;

    /// @notice The function to get the address of the governance contract
    /// @return the address of the governance contract
    function govAddress() external view returns (address);

    /// @notice Return potential reward. If user hasn't voted, or `getTotalVotesWeight` is zero, return zero
    /// @param proposalId the proposal id
    /// @param voter Voter address
    function getPotentialReward(uint256 proposalId, address voter) external view returns (uint256);
}
