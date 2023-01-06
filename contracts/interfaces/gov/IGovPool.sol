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
    /// @param settings the struct that holds information about settings of the proposal
    /// @param executed the boolean flag that sets to true when the proposal gets executed
    /// @param voteEnd the timestamp of voting end for the proposal
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

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param proposal the `Proposal` struct
    /// @param validatorProposal the `ExternalProposal` struct
    /// @param proposalState the value from enum `ProposalState`, that shows proposal state at current time
    /// @param requiredQuorum the required votes amount to confirm the proposal
    /// @param requiredValidatorsQuorum the the required validator votes to confirm the proposal
    struct ProposalView {
        Proposal proposal;
        IGovValidators.ExternalProposal validatorProposal;
        ProposalState proposalState;
        uint256 requiredQuorum;
        uint256 requiredValidatorsQuorum;
    }

    /// @notice The struct that holds information about the votes of the user in a single proposal
    /// @param totalVoted the total power of votes from one user for the proposal
    /// @param tokensVoted the total erc20 amount voted from one user for the proposal
    /// @param nftsVoted the set of ids of nfts voted from one user for the  proposal
    struct VoteInfo {
        uint256 totalVoted;
        uint256 tokensVoted;
        EnumerableSet.UintSet nftsVoted;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param totalVoted the total power of votes from one user for the proposal
    /// @param tokensVoted the total erc20 amount voted from one user for the proposal
    /// @param nftsVoted the array of ids of nfts voted from one user for the proposal
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

    struct OffChain {
        address verifier;
        bytes32[] hashes;
        mapping(bytes32 => bool) usedHashes;
    }

    /// @notice The function to get nft multiplier
    /// @return `address` of nft multiplier
    function nftMultiplier() external view returns (address);

    /// @notice The function to get the latest proposal id
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

    /// @notice The function for voting for proposal with own tokens
    /// @notice values `depositAmount`, `depositNftIds` may be zero if tokens were deposited before
    /// @notice values `voteAmount`, `voteNftIds` should be less or equal to the total deposit
    /// @param proposalId the id of proposal
    /// @param depositAmount the deposit amount in erc20
    /// @param depositNftIds the deposit nft ids
    /// @param voteAmount the erc20 vote amount
    /// @param voteNftIds the nft ids that will be used in voting
    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    /// @notice The function for voting for proposals with delegated tokens
    /// @param proposalId the id of proposal
    /// @param voteAmount the erc20 vote amount
    /// @param voteNftIds the nft ids that will be used in delegated voting
    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external;

    /// @notice The function for depositing tokens to the pool
    /// @param receiver the address of the deposit receiver
    /// @param amount the erc20 deposit amount
    /// @param nftIds the array of nft ids to deposit
    function deposit(address receiver, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for withdrawing deposited tokens
    /// @param receiver the withdrawal receiver address
    /// @param amount the erc20 withdrawal amount
    /// @param nftIds the array of nft ids to withdraw
    function withdraw(address receiver, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for delegating tokens
    /// @param delegatee the target address for delegation (person who will receive the delegation)
    /// @param amount the erc20 delegation amount
    /// @param nftIds the array of nft ids to delegate
    function delegate(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for undelegating delegated tokens
    /// @param delegatee the undelegation target address (person who will be undelegated)
    /// @param amount the erc20 undelegation amount
    /// @param nftIds the array of nft ids to undelegate
    function undelegate(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function that unlocks user funds in completed proposals
    /// @param user the user whose funds to unlock
    /// @param isMicropool the bool flag for micropool (unlock personal or delegated funds)
    function unlock(address user, bool isMicropool) external;

    /// @notice The function to unlock user funds from completed proposals
    /// @param proposalIds the array of proposals to unlock the funds in
    /// @param user the user to unlock the funds of
    /// @param isMicropool the bool flag for micropool (unlock personal or delegated funds)
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

    /// @notice The function for executing proposal and then claiming the reward
    /// @param proposalId the id of proposal
    function executeAndClaim(uint256 proposalId) external;

    /// @notice The function for changing description url
    /// @param newDescriptionURL the string with new url
    function editDescriptionURL(string calldata newDescriptionURL) external;

    /// @notice The function for changing verifier address
    /// @param newVerifier the address of verifier
    function changeVerifier(address newVerifier) external;

    /// @notice The function for setting address of nft multiplier contract
    /// @param nftMultiplierAddress the address of nft multiplier
    function setNftMultiplierAddress(address nftMultiplierAddress) external;

    /// @notice The paginated function for getting proposal info list
    /// @param offset the proposal starting index
    /// @param limit the number of proposals to observe
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

    /// @notice The function for getting total votes in the proposal by one voter
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the bool flag for micropool (personal or delegated votes)
    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (uint256, uint256);

    /// @notice The function to get required quorum of proposal
    /// @param proposalId the id of proposal
    /// @return the required number for votes to reach the quorum
    function getProposalRequiredQuorum(uint256 proposalId) external view returns (uint256);

    /// @notice The function to get information about user's votes
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the bool flag for micropool (personal or delegated votes)
    /// @return `VoteInfoView` array
    function getUserVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (VoteInfoView memory);

    /// @notice The function to get withdrawable assets
    /// @param delegator the delegator address
    /// @param delegatee the delegatee address
    /// @return `Arguments`: erc20 amount, array nft ids
    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view returns (uint256, ShrinkableArray.UintArray memory);

    function getDelegatorStakingRewards(
        address delegator
    ) external view returns (UserStakeRewardsView[] memory);

    /// @notice The function for saving ipfs hashes of offchain votings
    /// @param hashes the array of ipfs hashes
    /// @param signature the signature from verifier
    function saveOffchainResults(bytes32[] calldata hashes, bytes calldata signature) external;

    /// @notice The paginated function for getting ipfs hashes list
    /// @param offset the proposal starting index
    /// @param limit the number of proposals to observe
    /// @return hashes the bytes32 array
    function getHashes(
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory hashes);

    /// @notice The function for getting sign hasfrom bytes32 array, chainid, govPool address
    /// @param hashes the array of ipfs hashes
    /// @return bytes32 hash
    function getSignHash(bytes32[] calldata hashes) external view returns (bytes32);

    /// @notice The function for getting verifier address
    /// @return address of verifier
    function getVerifier() external view returns (address);
}
