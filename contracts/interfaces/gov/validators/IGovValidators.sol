// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovValidators {
    enum ProposalState {
        Voting,
        Defeated,
        Succeeded,
        Executed,
        Undefined
    }

    enum ProposalType {
        ChangeInternalDuration,
        ChangeInternalQuorum,
        ChangeBalance
    }

    struct InternalProposalSettings {
        uint64 duration;
        uint128 quorum;
    }

    struct ProposalCore {
        bool executed;
        uint64 voteEnd;
        uint128 quorum;
        uint256 votesFor;
        uint256 snapshotId;
    }

    struct InternalProposal {
        ProposalType proposalType;
        ProposalCore core;
        uint256 newValue;
        address userAddress;
    }

    struct ExternalProposal {
        ProposalCore core;
    }

    /**
     * @notice Create internal proposal for changing address balance, base quorum, base duration
     * @param proposalType `ProposalType`
     * 0 - `ChangeInternalDuration`, change base duration
     * 1 - `ChangeInternalQuorum`, change base quorum
     * 2 - `ChangeBalance`, change address balance
     * @param newValue New value (tokens amount, quorum or duration)
     * @param userAddress Validator address, set it if `proposalType` == `ChangeBalance`
     */
    function createInternalProposal(
        ProposalType proposalType,
        uint256 newValue,
        address userAddress
    ) external;

    /**
     * @notice Create external proposal. This function can call only `Gov` contract
     * @param proposalId Proposal ID from `Gov` contract
     * @param duration Duration from `Gov` contract
     * @param quorum Quorum from `Gov` contract
     */
    function createExternalProposal(
        uint256 proposalId,
        uint64 duration,
        uint128 quorum
    ) external;

    /**
     * @notice Vote in proposal
     * @param proposalId Proposal ID, internal or external
     * @param amount Amount of tokens to vote
     * @param isInternal If `true`, you will vote in internal proposal
     */
    function vote(
        uint256 proposalId,
        uint256 amount,
        bool isInternal
    ) external;

    /**
     * @notice Only for internal proposals. External proposals should be executed from governance.
     * @param proposalId Internal proposal ID
     */
    function execute(uint256 proposalId) external;

    /**
     * @notice Return proposal state
     * @dev Options:
     * `Voting` - proposal where addresses can vote.
     * `Defeated` - proposal where voting time is over and proposal defeated.
     * `Succeeded` - proposal with the required number of votes.
     * `Executed` - executed proposal (only for internal proposal).
     * `Undefined` - nonexistent proposal.
     */
    function getProposalState(uint256 proposalId, bool isInternal)
        external
        view
        returns (ProposalState);

    /**
     * @param proposalId Proposal ID
     * @param isInternal If `true`, check internal proposal
     * @return `true` if quorum reached. Return `false` if not or proposal isn't exist.
     */
    function isQuorumReached(uint256 proposalId, bool isInternal) external view returns (bool);
}
