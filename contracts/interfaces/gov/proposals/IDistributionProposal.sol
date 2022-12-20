// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract the governance can execute in order to distribute rewards proportionally among
 * all the voters who participated in the certain proposal
 */
interface IDistributionProposal {
    /// @notice The struct holds information about distribution proposal
    /// @param rewardAddress the address of reward token
    /// @param rewardAmount the total amount of reward
    /// @param claimed mapping, that holds boolean flag, if true then user claimed reward
    struct DistributionProposalStruct {
        address rewardAddress;
        uint256 rewardAmount;
        mapping(address => bool) claimed;
    }

    /// @notice Executed by `Gov` contract, open 'claim'
    /// @param proposalId the id of distribution proposal, it is internal id of this contract
    /// @param token the reward address token
    /// @param amount the total amount of reward
    function execute(uint256 proposalId, address token, uint256 amount) external payable;

    /// @notice Distribute rewards
    /// @param voter Voter address
    /// @param proposalIds the array of proposal ids
    function claim(address voter, uint256[] calldata proposalIds) external;

    /// @notice Return potential reward. If user hasn't voted, or `getTotalVotesWeight` is zero, return zero
    /// @param proposalId the id of proposal
    /// @param voter Voter address
    function getPotentialReward(uint256 proposalId, address voter) external view returns (uint256);
}
