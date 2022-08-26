// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../libs/data-structures/ShrinkableArray.sol";

import "./settings/IGovSettings.sol";

/**
 * This is the Governance pool contract. This contract is the third contract the user can deploy through
 * the factory. The users can participate in proposal's creation, voting and execution processes
 */
interface IGovPool {
    /// @dev IGovCreator
    struct ProposalCore {
        IGovSettings.ProposalSettings settings;
        bool executed;
        uint64 voteEnd;
        uint256 votesFor;
        uint256 nftPowerSnapshotId;
        uint256 proposalId;
    }

    struct Proposal {
        ProposalCore core;
        string descriptionURL;
        address[] executors;
        uint256[] values;
        bytes[] data;
    }

    /// @notice Create proposal
    /// @notice For internal proposal, last executor should be `GovSetting` contract
    /// @notice For typed proposal, last executor should be typed contract
    /// @notice For external proposal, any configuration of addresses and bytes
    /// @param descriptionURL IPFS url to the proposal's description
    /// @param executors Executors addresses
    /// @param values the ether values
    /// @param data data Bytes
    function createProposal(
        string calldata descriptionURL,
        address[] memory executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) external;

    /// @param proposalId Proposal ID
    /// @return Executor addresses
    /// @return Data for each address
    function getProposalInfo(uint256 proposalId)
        external
        view
        returns (address[] memory, bytes[] memory);

    /// @dev IGovVote
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

    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    /// @notice Move proposal from internal voting to `Validators` contract
    /// @param proposalId Proposal ID
    function moveProposalToValidators(uint256 proposalId) external;

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (uint256, uint256);

    /// @param proposalId Proposal ID
    /// @return `ProposalState`:
    /// 0 -`Voting`, proposal where addresses can vote
    /// 1 -`WaitingForVotingTransfer`, approved proposal that waiting `moveProposalToValidators()` call
    /// 2 -`ValidatorVoting`, validators voting
    /// 3 -`Defeated`, proposal where voting time is over and proposal defeated on first or second step
    /// 4 -`Succeeded`, proposal with the required number of votes on each step
    /// 5 -`Executed`, executed proposal
    /// 6 -`Undefined`, nonexistent proposal
    function getProposalState(uint256 proposalId) external view returns (ProposalState);

    /// @dev IGovFee
    /// @notice Withdraw fee
    /// @param tokenAddress ERC20 token address or zero address for native withdraw
    /// @param recipient Tokens recipient
    function withdrawFee(address tokenAddress, address recipient) external;

    /// @dev IGovUserKeeperController
    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function getWithdrawableAssets(address user)
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts);

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function getUndelegateableAssets(address delegator, address delegatee)
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts);

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function unlock(address user, bool isMicropool) external;

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) external;

    /// @dev IGovPool
    /// @notice Execute proposal
    /// @param proposalId Proposal ID
    function execute(uint256 proposalId) external;

    function claimReward(uint256[] calldata proposalIds) external;

    function executeAndClaim(uint256 proposalId) external;

    function editDescriprionURL(string calldata newDescriptionURL) external;
}
