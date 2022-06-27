// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract the governance can execute in order to distribute rewards proportionally among
 * all the voters who participated in the certain proposal
 */
interface IDistributionProposal {
    /// @notice Once, set proposal ID to contract
    /// @param proposalId Proposal ID from `Gov` contract
    function setProposalId(uint256 proposalId) external;

    /// @notice Executed by `Gov` contract, open 'claim'
    function execute() external;

    /// @notice Distribute rewards
    /// @param voter Voter address
    function claim(address voter) external;

    /// @notice Return potential reward. If user isn't vote, or `getTotalVotesWeight` is zero, return zero
    /// @param voter Voter address
    function getPotentialReward(address voter) external view returns (uint256);
}
