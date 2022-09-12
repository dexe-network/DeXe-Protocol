// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract the governance can execute in order to distribute rewards proportionally among
 * all the voters who participated in the certain proposal
 */
interface IDistributionProposal {
    struct DistributionProposalStruct {
        address rewardAddress;
        uint256 rewardAmount;
        /// @dev If claimed, return `true`
        mapping(address => bool) claimed;
    }

    event DistributionProposalClaimed(uint256 id, address sender, uint256 amount);

    /// @notice Executed by `Gov` contract, open 'claim'
    function execute(
        uint256 proposalId,
        address token,
        uint256 amount
    ) external payable;

    /// @notice Distribute rewards
    /// @param voter Voter address
    function claim(address voter, uint256[] calldata proposalIds) external;

    /// @notice Return potential reward. If user isn't vote, or `getTotalVotesWeight` is zero, return zero
    /// @param voter Voter address
    function getPotentialReward(
        uint256 proposalId,
        address voter,
        uint256 rewardAmount
    ) external view returns (uint256);
}
