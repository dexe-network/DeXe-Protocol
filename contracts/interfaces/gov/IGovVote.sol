// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface IGovVote {
    enum ProposalState {
        Voting,
        WaitingForVotingTransfer,
        ValidatorVoting,
        Defeated,
        Succeeded,
        Executed,
        Undefined
    }

    struct VoteInfo {
        uint256 totalVoted;
        uint256 tokensVoted;
        EnumerableSet.UintSet nftsVoted;
    }

    /**
     * @notice Token voting
     * @param proposalId Proposal ID
     * @param amount Token amount. Wei
     */
    function voteTokens(uint256 proposalId, uint256 amount) external;

    /**
     * @notice Delegate token voting
     * @param proposalId Proposal ID
     * @param amount Token amount. Wei
     * @param holder Token holder
     */
    function voteDelegatedTokens(
        uint256 proposalId,
        uint256 amount,
        address holder
    ) external;

    /**
     * @notice NFTs voting
     * @param proposalId Proposal ID
     * @param nftIds NFTs that the user votes with
     */
    function voteNfts(uint256 proposalId, uint256[] calldata nftIds) external;

    /**
     * @notice NFTs voting
     * @param proposalId Proposal ID
     * @param nftIds NFTs that the user votes with
     * @param holder NFTs holder
     */
    function voteDelegatedNfts(
        uint256 proposalId,
        uint256[] calldata nftIds,
        address holder
    ) external;

    /**
     * @notice Unlock tokens and NFTs in all ended proposals.
     * @param user Voter address
     */
    function unlock(address user) external;

    /**
     * @notice Unlock tokens and NFTs in selected ended proposals.
     * @param proposalIds Proposal IDs
     * @param user Voter address
     */
    function unlockInProposals(uint256[] memory proposalIds, address user) external;

    /**
     * @notice Unlock NFTs in ended proposals
     * @param proposalId Proposal ID
     * @param user Voter address
     * @param nftIds NFTs to unlock
     */
    function unlockNfts(
        uint256 proposalId,
        address user,
        uint256[] calldata nftIds
    ) external;

    /**
     * @notice Move proposal from internal voting to `Validators` contract
     * @param proposalId Proposal ID
     */
    function moveProposalToValidators(uint256 proposalId) external;

    /**
     * @param proposalId Proposal ID
     * @param voter Voter address
     * @return Total voted amount in proposal, total voted amount by address, voted tokens amount
     */
    function getVoteAmounts(uint256 proposalId, address voter)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256[] memory
        );

    /**
     * @param proposalId Proposal ID
     * @return `ProposalState`:
     * 0 -`Voting`, proposal where addresses can vote
     * 1 -`WaitingForVotingTransfer`, approved proposal that waiting `moveProposalToValidators()` call
     * 2 -`ValidatorVoting`, validators voting
     * 3 -`Defeated`, proposal where voting time is over and proposal defeated on first or second step
     * 4 -`Succeeded`, proposal with the required number of votes on each step
     * 5 -`Executed`, executed proposal
     * 6 -`Undefined`, nonexistent proposal
     */
    function getProposalState(uint256 proposalId) external view returns (ProposalState);
}
