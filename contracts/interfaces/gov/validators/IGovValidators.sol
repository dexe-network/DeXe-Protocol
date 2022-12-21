// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the voting contract that is queried on the proposal's second voting stage
 */
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
        ChangeInternalDurationAndQuorum,
        ChangeBalances
    }

    /// @notice The struct holds information about settings for internal proposal
    /// @param duration the duration of voting end
    /// @param quorum the percentage of total user's votes to confirm the proposal
    struct InternalProposalSettings {
        uint64 duration;
        uint128 quorum;
    }

    /// @notice The struct holds core properties of proposal
    /// @param executed the boolean flag that sets to true when proposal executed
    /// @param voteEnd the timestamp of ending of voting for proposal
    /// @param quorum the percentage of total user's votes to confirm the proposal
    /// @param votesFor the total number votes for proposal from all voters
    /// @param snapshotId the id of snapshot
    struct ProposalCore {
        bool executed;
        uint64 voteEnd;
        uint128 quorum;
        uint256 votesFor;
        uint256 snapshotId;
    }

    /// @notice The struct holds all information about internal proposal
    /// @param proposalType the `ProposalType` enum
    /// @param core the struct that holds information about core properties of proposal
    /// @param descriptionURL the string with link to IPFS doc with proposal description
    /// @param newValues the array of new balances
    /// @param userAddresses the array of user addresses
    struct InternalProposal {
        ProposalType proposalType;
        ProposalCore core;
        string descriptionURL;
        uint256[] newValues;
        address[] userAddresses;
    }

    /// @notice The struct holds all information about external proposal
    /// @param core the struct that holds information about core properties of proposal
    struct ExternalProposal {
        ProposalCore core;
    }

    /// @notice The struct that used in view functs of contract as a returns arg
    /// @param proposal the `InternalProposal` struct
    /// @param proposalState the `ProposalState` enum
    /// @param requiredQuorum the percentage of total user's votes to confirm the proposal
    struct InternalProposalView {
        InternalProposal proposal;
        ProposalState proposalState;
        uint256 requiredQuorum;
    }

    /// @notice The function for getting latest id of internal proposal
    /// @return `id` of latest internal proposal
    function latestInternalProposalId() external view returns (uint256);

    /// @notice The function for getting current number of validators
    /// @return `number` of validators
    function validatorsCount() external view returns (uint256);

    /// @notice Create internal proposal for changing validators balances, base quorum, base duration
    /// @param proposalType `ProposalType`
    /// 0 - `ChangeInternalDuration`, change base duration
    /// 1 - `ChangeInternalQuorum`, change base quorum
    /// 2 - `ChangeInternalDurationAndQuorum`, change base duration and quorum
    /// 3 - `ChangeBalances`, change address balance
    /// @param newValues New values (tokens amounts array, quorum or duration or both)
    /// @param userAddresses Validators addresses, set it if `proposalType` == `ChangeBalances`
    function createInternalProposal(
        ProposalType proposalType,
        string calldata descriptionURL,
        uint256[] calldata newValues,
        address[] calldata userAddresses
    ) external;

    /// @notice Create external proposal. This function can call only `Gov` contract
    /// @param proposalId Proposal ID from `Gov` contract
    /// @param duration Duration from `Gov` contract
    /// @param quorum Quorum from `Gov` contract
    function createExternalProposal(uint256 proposalId, uint64 duration, uint128 quorum) external;

    /// @notice The function for changing validators balances
    /// @param newValues the array of new balances
    /// @param userAddresses the array validators addresses
    function changeBalances(
        uint256[] calldata newValues,
        address[] calldata userAddresses
    ) external;

    /// @notice Vote in proposal
    /// @param proposalId Proposal ID, internal or external
    /// @param amount Amount of tokens to vote
    /// @param isInternal If `true`, you will vote in internal proposal
    function vote(uint256 proposalId, uint256 amount, bool isInternal) external;

    /// @notice Only for internal proposals. External proposals should be executed from governance.
    /// @param proposalId Internal proposal ID
    function execute(uint256 proposalId) external;

    /// @notice The function for getting information about external proposal
    /// @param index the index of proposal
    /// @return `ExternalProposal` struct
    function getExternalProposal(uint256 index) external view returns (ExternalProposal memory);

    /// @notice The function for getting information about internal proposals
    /// @param offset the starting index of the investors array
    /// @param limit the length of the observed array
    /// @return `InternalProposalView` struct array
    function getInternalProposals(
        uint256 offset,
        uint256 limit
    ) external view returns (InternalProposalView[] memory);

    /// @notice Return proposal state
    /// @dev Options:
    /// `Voting` - proposal where addresses can vote.
    /// `Defeated` - proposal where voting time is over and proposal defeated.
    /// `Succeeded` - proposal with the required number of votes.
    /// `Executed` - executed proposal (only for internal proposal).
    /// `Undefined` - nonexistent proposal.
    function getProposalState(
        uint256 proposalId,
        bool isInternal
    ) external view returns (ProposalState);

    /// @notice The function for getting proposal required quorum
    /// @param proposalId the id of proposal
    /// @param isInternal the boolean flag, if true then proposal is internal
    /// return `required quorum`
    function getProposalRequiredQuorum(
        uint256 proposalId,
        bool isInternal
    ) external view returns (uint256);

    /// @notice The function that defines is user a validator
    /// @param user the address of user
    /// @return `flag`, if true, than user is a validator
    function isValidator(address user) external view returns (bool);
}
