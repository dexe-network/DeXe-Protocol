// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../gov/validators/GovValidatorsToken.sol";

/**
 * This is the voting contract that is queried on the proposal's second voting stage
 */
interface IGovValidators {
    enum ProposalState {
        Voting,
        Defeated,
        Succeeded,
        Locked,
        Executed,
        Undefined
    }

    enum ProposalType {
        ChangeInternalDuration,
        ChangeInternalExecutionDelay,
        ChangeInternalQuorum,
        ChangeInternalDurationAndExecutionDelayAndQuorum,
        ChangeBalances
    }

    /// @notice The struct holds information about settings for validators proposal
    /// @param duration the duration of voting
    /// @param executionDelay the delay in seconds after voting end
    /// @param quorum the percentage of validators token supply to confirm the proposal
    struct ProposalSettings {
        uint64 duration;
        uint64 executionDelay;
        uint128 quorum;
    }

    /// @notice The struct holds core properties of a proposal
    /// @param executed the boolean flag that indicated whether the proposal is executed or not
    /// @param snapshotId the id of snapshot
    /// @param voteEnd the timestamp of voting end of the proposal
    /// @param executeAfter the timestamp of execution in seconds after voting end
    /// @param quorum the percentage of validators token supply to confirm the proposal
    /// @param votesFor the total number of votes in proposal from all voters
    /// @param votesAgainst the total number of votes against proposal from all voters
    struct ProposalCore {
        bool executed;
        uint56 snapshotId;
        uint64 voteEnd;
        uint64 executeAfter;
        uint128 quorum;
        uint256 votesFor;
        uint256 votesAgainst;
    }

    /// @notice The struct holds information about the internal proposal
    /// @param proposalType the `ProposalType` enum
    /// @param core the struct that holds information about core properties of the proposal
    /// @param descriptionURL the string with link to IPFS doc with proposal description
    /// @param newValues the array of new values. Usage varies by proposal type
    /// @param userAddresses the array of user addresses
    struct InternalProposal {
        ProposalType proposalType;
        ProposalCore core;
        string descriptionURL;
        uint256[] newValues;
        address[] userAddresses;
    }

    /// @notice The struct holds information about the external proposal
    /// @param core the struct that holds information about core properties of a proposal
    struct ExternalProposal {
        ProposalCore core;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param proposal the `InternalProposal` struct
    /// @param proposalState the `ProposalState` enum
    /// @param requiredQuorum the percentage of validators token supply to confirm the proposal
    struct InternalProposalView {
        InternalProposal proposal;
        ProposalState proposalState;
        uint256 requiredQuorum;
    }

    /// @notice The event emitted when the external proposal is created
    /// @param proposalId the id of the proposal
    /// @param quorum the percentage of validators token supply to confirm the proposal
    event ExternalProposalCreated(uint256 proposalId, uint256 quorum);

    /// @notice The event emitted when the internal proposal is created
    /// @param proposalId the id of the proposal
    /// @param proposalDescription the description of the proposal
    /// @param quorum the percentage of validators token supply to confirm the proposal
    /// @param sender the address of the sender
    event InternalProposalCreated(
        uint256 proposalId,
        string proposalDescription,
        uint256 quorum,
        address sender
    );

    /// @notice The event emitted when the internal proposal is executed
    /// @param proposalId the id of the proposal
    /// @param executor the address of the executor
    event InternalProposalExecuted(uint256 proposalId, address executor);

    /// @notice The event emitted when validators vote in proposal
    /// @param proposalId the id of the proposal
    /// @param sender the address of the sender
    /// @param vote the number of votes
    /// @param isInternal the boolean flag, if true then proposal is internal
    /// @param isVoteFor the boolean flag, if true then vote is for proposal
    event Voted(uint256 proposalId, address sender, uint256 vote, bool isInternal, bool isVoteFor);

    /// @notice The event emitted when validators balances are changed
    /// @param validators the array of validators addresses
    /// @param newBalance the array of new balances
    event ChangedValidatorsBalances(address[] validators, uint256[] newBalance);

    /// @notice The function for initializing the contract
    /// @param name the name of the validators token
    /// @param symbol the symbol of the validators token
    /// @param proposalSettings the struct with settings for proposals
    /// @param validators the array of validators addresses
    /// @param balances the array of initial token balances of the validators
    function __GovValidators_init(
        string calldata name,
        string calldata symbol,
        ProposalSettings calldata proposalSettings,
        address[] calldata validators,
        uint256[] calldata balances
    ) external;

    /// @notice The function for getting the address of the validators token
    /// @return the address of the validators token
    function govValidatorsToken() external view returns (GovValidatorsToken);

    /// @notice The function for getting the latest id of the internal proposal
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
    /// @param proposalSettings `ProposalSettings` struct
    function createExternalProposal(
        uint256 proposalId,
        ProposalSettings calldata proposalSettings
    ) external;

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
    /// @param isVoteFor If `true`, you will vote for proposal, else against
    function vote(uint256 proposalId, uint256 amount, bool isInternal, bool isVoteFor) external;

    /// @notice Only for internal proposals. External proposals should be executed from governance.
    /// @param proposalId Internal proposal ID
    function execute(uint256 proposalId) external;

    /// @notice The function called by governance that marks the external proposal as executed
    /// @param proposalId External proposal ID
    function executeExternalProposal(uint256 proposalId) external;

    /// @notice The function for getting information about the external proposals
    /// @param index the index of proposal
    /// @return `ExternalProposal` struct
    function getExternalProposal(uint256 index) external view returns (ExternalProposal memory);

    /// @notice The function for getting information about internal proposals
    /// @param offset the starting proposal index
    /// @param limit the length of the observed proposals
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
    /// @return the number of votes to reach the quorum
    function getProposalRequiredQuorum(
        uint256 proposalId,
        bool isInternal
    ) external view returns (uint256);

    /// @notice The function that checks if a user is a validator
    /// @param user the address of a user
    /// @return `flag`, if true, than user is a validator
    function isValidator(address user) external view returns (bool);
}
