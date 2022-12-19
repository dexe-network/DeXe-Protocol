// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../libs/data-structures/ShrinkableArray.sol";

import "./settings/IGovSettings.sol";
import "./validators/IGovValidators.sol";

/**
 * This is the Governance pool contract. This contract is the third contract the user can deploy through
 * the factory. The users can participate in proposal's creation, voting and execution processes
 */
interface IGovPool {
    enum ProposalState {
        Voting,
        WaitingForVotingTransfer,
        ValidatorVoting,
        Defeated,
        Succeeded,
        Executed,
        Undefined
    }

    /// @notice The struct holds core properties of proposal
    /// @param settongs the struct that hold information about settings of proposal
    /// @param executed the boolean flag that sets to true when proposal executed
    /// @param voteEnd the timestamp of ending of voting for proposal
    /// @param votesFor the total number votes for proposal from all voters
    /// @param nftPowerSnapshotId the id of nft power snapshot
    struct ProposalCore {
        IGovSettings.ProposalSettings settings;
        bool executed;
        uint64 voteEnd;
        uint256 votesFor;
        uint256 nftPowerSnapshotId;
    }

    /// @notice The struct holds all information about proposal
    /// @param core the struct that holds information about core properties of proposal
    /// @param descriptionURL the string with link to IPFS doc with proposal description
    /// @param executors the array with addresses of call's targets, bounded by index with `values` and `data` arrays
    /// @param values the array of eth value for calls, bounded by index with `executors` and `data` arrays
    /// @param data the array of call data, bounded by index with `executors` and `values` arrays
    struct Proposal {
        ProposalCore core;
        string descriptionURL;
        address[] executors;
        uint256[] values;
        bytes[] data;
    }

    /// @notice The struct that used in view functs of contract as a returns arg
    /// @param proposal the `Proposal` struct
    /// @param validatorProposal the `ExternalProposal` struct
    /// @param proposalState the value from enum `ProposalState`, that shows proposal state at current time
    /// @param requiredQuorum the percentage of total user's votes to confirm the proposal
    /// @param requiredValidatorsQuorum the percentage of total validator's votes to confirm the proposal
    struct ProposalView {
        Proposal proposal;
        IGovValidators.ExternalProposal validatorProposal;
        ProposalState proposalState;
        uint256 requiredQuorum;
        uint256 requiredValidatorsQuorum;
    }

    /// @notice The struct that holds information about votes of user in one proposal
    /// @param totalVoted the total power of votes from one user for proposal
    /// @param tokensVoted the total erc20 amount voted from one user for proposal
    /// @param nftsVoted the set of ids of nfts voted from one user for proposal
    struct VoteInfo {
        uint256 totalVoted;
        uint256 tokensVoted;
        EnumerableSet.UintSet nftsVoted;
    }

    /// @notice The struct that used in view functs of contract as a return arg
    /// @param totalVoted the total power of votes from one user for proposal
    /// @param tokensVoted the total erc20 amount voted from one user for proposal
    /// @param nftsVoted the array of ids of nfts voted from one user for proposal
    struct VoteInfoView {
        uint256 totalVoted;
        uint256 tokensVoted;
        uint256[] nftsVoted;
    }

    struct UserStakeRewardsView {
        address micropool;
        address[] rewardTokens;
        uint256[] expectedRewards;
        uint256[] realRewards;
    }

    struct DelegatorInfo {
        uint256 latestCumulativeSum;
        uint256 pendingRewards;
    }

    struct RewardTokenInfo {
        mapping(address => DelegatorInfo) delegators;
        uint256 cumulativeSum;
    }

    struct MicropoolInfo {
        uint256 totalStake;
        EnumerableSet.AddressSet rewardTokens;
        mapping(address => RewardTokenInfo) rewardTokenInfos;
        mapping(address => uint256) latestDelegatorStake;
    }

    /// @notice The function to get nft multiplier
    /// @return `address` of nft multiplier
    function nftMultiplier() external view returns (address);

    /// @notice The function to get latest id of proposal
    /// @return `id` of latest proposal
    function latestProposalId() external view returns (uint256);

    /// @notice The function to get helper contract of this pool
    /// @return settings settings address
    /// @return userKeeper user keeper address
    /// @return validators validators address
    /// @return distributionProposal distribution proposal address
    function getHelperContracts()
        external
        view
        returns (
            address settings,
            address userKeeper,
            address validators,
            address distributionProposal
        );

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
        string calldata misc,
        address[] memory executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) external;

    /// @notice Move proposal from internal voting to `Validators` contract
    /// @param proposalId Proposal ID
    function moveProposalToValidators(uint256 proposalId) external;

    /// @notice The function for voting for proposal with own liquids
    /// @notice values `depositAmount`, `depositNftIds` may be zero if volumes were deposited before
    /// @notice values `voteAmount`, `voteNftIds` should be more of equal to total deposit
    /// @param proposalId the id of proposal
    /// @param depositAmount the amount of deposit in erc20
    /// @param depositNftIds the nft ids of deposit
    /// @param voteAmount the amount of vote in erc20
    /// @param voteNftIds the nft ids of vote
    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    /// @notice The function for voting for proposal with delegated liquids
    /// @param proposalId the id of proposal
    /// @param voteAmount the amount of vote in erc20
    /// @param voteNftIds the nft ids of vote
    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    /// @notice The function for depositing liquids
    /// @param receiver the address of target for deposit
    /// @param amount the amount of deposit
    /// @param nftIds the array of nft ids to deposit
    function deposit(address receiver, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for withdrawing deposited liquids
    /// @param receiver the address of target for withdraw
    /// @param amount the amount of withdraw
    /// @param nftIds the array of nft ids to withdraw
    function withdraw(address receiver, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for delegating liquids
    /// @param delegatee the address of target for delegation (person who will get the delegation)
    /// @param amount the amount of delegation
    /// @param nftIds the array of nft ids to delegation
    function delegate(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for undelegating delegated liquids
    /// @param delegatee the address of target for undelegation (person who got the delegation)
    /// @param amount the amount of undelegation
    /// @param nftIds the array of nft ids to undelegation
    function undelegate(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function call `unlockInProposals` for all proposals
    /// @param user the target address to unlock
    /// @param isMicropool the bool flag for micropool
    function unlock(address user, bool isMicropool) external;

    /// @notice The function to unlock liquids from proposals
    /// @param proposalIds the array of proposal ids
    /// @param user the target address to unlock
    /// @param isMicropool the bool flag for micropool
    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) external;

    /// @notice Execute proposal
    /// @param proposalId Proposal ID
    function execute(uint256 proposalId) external;

    /// @notice The function for claiming rewards from executed proposals
    /// @param proposalIds the array of proposal ids
    function claimRewards(uint256[] calldata proposalIds) external;

    /// @notice The function for execution proposal and then claiming reward
    /// @param proposalId the id of proposal
    function executeAndClaim(uint256 proposalId) external;

    /// @notice The function for changing description url
    /// @param newDescriptionURL the string with new url
    function editDescriptionURL(string calldata newDescriptionURL) external;

    /// @notice The function for setting address of nft multiplier
    /// @param nftMultiplierAddress the address of nft multiplier
    function setNftMultiplierAddress(address nftMultiplierAddress) external;

    /// @notice The function with paggination for getting proposal info list
    /// @param offset the starting index of the investors array
    /// @param limit the length of the observed array
    /// @return `ProposalView` array
    function getProposals(
        uint256 offset,
        uint256 limit
    ) external view returns (ProposalView[] memory);

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

    /// @notice The function for getting total votes for proposal from one voter
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the bool flag for micropool
    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (uint256, uint256);

    /// @notice The function to get required quorum of proposal
    /// @param proposalId the id of proposal
    function getProposalRequiredQuorum(uint256 proposalId) external view returns (uint256);

    /// @notice The function to get information about user's votes
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the bool flag for micropool
    /// @return `VoteInfoView` array
    function getUserVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (VoteInfoView memory);

    /// @notice The function to get withdrawable assets
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @return `Arguments`: erc20 amount, array nft ids
    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view returns (uint256, ShrinkableArray.UintArray memory);

    function getDelegatorStakingRewards(
        address delegator
    ) external view returns (UserStakeRewardsView[] memory);
}
