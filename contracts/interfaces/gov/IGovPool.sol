// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

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
        SucceededFor,
        SucceededAgainst,
        Locked,
        ExecutedFor,
        ExecutedAgainst,
        Undefined
    }

    enum RewardType {
        Create,
        VoteFor,
        VoteAgainst,
        VoteForDelegated,
        VoteAgainstDelegated,
        VoteForTreasury,
        VoteAgainstTreasury,
        Execute,
        SaveOffchainResults
    }

    enum VoteType {
        PersonalVote,
        MicropoolVote,
        DelegatedVote,
        TreasuryVote
    }

    // TODO: ADD DOCS
    struct Dependencies {
        address settingsAddress;
        address userKeeperAddress;
        address distributionAddress;
        address validatorsAddress;
        address expertNftAddress;
    }

    /// @notice The struct holds core properties of proposal
    /// @param settings the struct that holds information about settings of the proposal
    /// @param executed the boolean flag that sets to true when the proposal gets executed
    /// @param voteEnd the timestamp of voting end for the proposal
    /// @param executeAfter the timestamp of execution in seconds after voting end
    /// @param votesFor the total number votes for proposal from all voters
    /// @param votesAgainst the total number votes against proposal from all voters
    /// @param nftPowerSnapshotId the id of nft power snapshot
    struct ProposalCore {
        IGovSettings.ProposalSettings settings;
        bool executed;
        uint64 voteEnd;
        uint64 executeAfter;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 nftPowerSnapshotId;
    }

    /// @notice The struct holds information about proposal action
    /// @param executor the addresse of call's target, bounded by index with `value` and `data`
    /// @param value the eth value for call, bounded by index with `executor` and `data`
    /// @param data the of call data, bounded by index with `executor` and `value`
    struct ProposalAction {
        address executor;
        uint256 value;
        bytes data;
    }

    /// @notice The struct holds all information about proposal
    /// @param core the struct that holds information about core properties of proposal
    /// @param descriptionURL the string with link to IPFS doc with proposal description
    /// @param actionsOnFor the array of structs with information about actions on for step
    /// @param actionsOnAgainst the array of structs with information about actions on against step
    struct Proposal {
        ProposalCore core;
        string descriptionURL;
        ProposalAction[] actionsOnFor;
        ProposalAction[] actionsOnAgainst;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param proposal the `Proposal` struct
    /// @param validatorProposal the `ExternalProposal` struct
    /// @param proposalState the value from enum `ProposalState`, that shows proposal state at current time
    /// @param requiredQuorum the required votes amount to confirm the proposal
    /// @param requiredValidatorsQuorum the the required validator votes to confirm the proposal
    /// @param executeAfter the timestamp of start available execution in seconds
    struct ProposalView {
        Proposal proposal;
        IGovValidators.ExternalProposal validatorProposal;
        ProposalState proposalState;
        uint256 requiredQuorum;
        uint256 requiredValidatorsQuorum;
        uint64 executeAfter;
    }

    /// @notice The struct that holds information about the votes of the user in a single proposal
    /// @param totalVoted the total power of votes from one user for the proposal
    /// @param tokensVoted the total erc20 amount voted from one user for the proposal
    /// @param nftsVoted the set of ids of nfts voted from one user for the  proposal
    struct VoteInfo {
        uint256 totalVotedFor;
        uint256 totalVotedAgainst;
        uint256 tokensVotedFor;
        uint256 tokensVotedAgainst;
        EnumerableSet.UintSet nftsVotedFor;
        EnumerableSet.UintSet nftsVotedAgainst;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param totalVoted the total power of votes from one user for the proposal
    /// @param tokensVoted the total erc20 amount voted from one user for the proposal
    /// @param nftsVoted the array of ids of nfts voted from one user for the proposal
    struct VoteInfoView {
        uint256 totalVotedFor;
        uint256 totalVotedAgainst;
        uint256 tokensVotedFor;
        uint256 tokensVotedAgainst;
        uint256[] nftsVotedFor;
        uint256[] nftsVotedAgainst;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param micropool the address of the delegatee
    /// @param rewardTokens the list of reward tokens addresses
    /// @param expectedRewards the list of expected rewards
    /// @param realRewards the list of real rewards (minimum of expected rewards and governance pool token balances)
    struct UserStakeRewardsView {
        address micropool;
        address[] rewardTokens;
        uint256[] expectedRewards;
        uint256[] realRewards;
    }

    /// @notice The struct that holds delegator properties (only for internal needs)
    /// @param latestCumulativeSum delegator's latest cumulative sum
    /// @param pendingRewards delegator's pending rewards
    struct DelegatorInfo {
        uint256 latestCumulativeSum;
        uint256 pendingRewards;
    }

    /// @notice The struct that holds reward token properties (only for internal needs)
    /// @param delegators matching delegators addresses with their parameters
    /// @param cumulativeSum global cumulative sum
    struct RewardTokenInfo {
        mapping(address => DelegatorInfo) delegators;
        uint256 cumulativeSum;
    }

    /// @notice The struct that holds micropool properties (only for internal needs)
    /// @param totalStake the current total sum of all delegators stakes
    /// @param rewardTokens the list of reward tokens
    /// @param rewardTokenInfos matching reward tokens to their parameters
    /// @param latestDelegatorStake matching delegators to their latest stakes
    struct MicropoolInfo {
        uint256 totalStake;
        EnumerableSet.AddressSet rewardTokens;
        mapping(address => RewardTokenInfo) rewardTokenInfos;
        mapping(address => uint256) latestDelegatorStake;
    }

    struct Rewards {
        uint256 rewardFor;
        uint256 rewardAgainst;
    }

    /// @notice The struct that holds reward properties (only for internal needs)
    /// @param onchainRewards matching proposal ids to their rewards
    /// @param offchainRewards matching off-chain token addresses to their rewards
    /// @param offchainTokens the list of off-chain token addresses
    struct PendingRewards {
        mapping(uint256 => Rewards) onchainRewards;
        mapping(address => uint256) offchainRewards;
        EnumerableSet.AddressSet offchainTokens;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param onchainRewards the list of on-chain rewards
    /// @param offchainRewards the list of off-chain rewards
    /// @param offchainTokens the list of off-chain token addresses
    struct PendingRewardsView {
        uint256[] onchainRewards;
        uint256[] offchainRewards;
        address[] offchainTokens;
    }

    /// @notice The struct that holds off-chain properties (only for internal needs)
    /// @param verifier the off-chain verifier address
    /// @param resultsHash the ipfs results hash
    /// @param usedHashes matching hashes to their usage state
    struct OffChain {
        address verifier;
        string resultsHash;
        mapping(bytes32 => bool) usedHashes;
    }

    /// @notice The function to get nft multiplier
    /// @return `address` of nft multiplier
    function nftMultiplier() external view returns (address);

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
    /// @param misc the string with additional information
    /// @param actionsOnFor the array of structs with information about actions on for step
    /// @param actionsOnAgainst the array of structs with information about actions on against step
    function createProposal(
        string calldata descriptionURL,
        string calldata misc,
        ProposalAction[] calldata actionsOnFor,
        ProposalAction[] calldata actionsOnAgainst
    ) external;

    /// @notice Move proposal from internal voting to `Validators` contract
    /// @param proposalId Proposal ID
    function moveProposalToValidators(uint256 proposalId) external;

    /// @notice The function for voting for proposal with own tokens
    /// @notice values `voteAmount`, `voteNftIds` should be less or equal to the total deposit
    /// @param proposalId the id of proposal
    /// @param voteAmount the erc20 vote amount
    /// @param voteNftIds the nft ids that will be used in voting
    /// @param isVoteFor the bool flag for voting for or against the proposal
    function vote(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external;

    /// @notice The function for voting for proposals with delegated tokens
    /// @param proposalId the id of proposal
    /// @param voteAmount the erc20 vote amount
    /// @param voteNftIds the nft ids that will be used in delegated voting
    /// @param isVoteFor the bool flag for voting for or against the proposal
    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
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

    /// @notice The function for delegating tokens from treasury
    /// @param delegatee the target address for delegation (person who will receive the delegation)
    /// @param amount the erc20 delegation amount
    /// @param nftIds the array of nft ids to delegate
    function delegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function for requesting delegated tokens
    /// @param delegatee the delegation target address (person who will be delegated)
    /// @param amount the erc20 delegation amount
    /// @param nftIds the array of nft ids to delegate
    function request(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for undelegating delegated tokens
    /// @param delegatee the undelegation target address (person who will be undelegated)
    /// @param amount the erc20 undelegation amount
    /// @param nftIds the array of nft ids to undelegate
    function undelegate(address delegatee, uint256 amount, uint256[] calldata nftIds) external;

    /// @notice The function for undelegating delegated tokens from treasury
    /// @param delegatee the undelegation target address (person who will be undelegated)
    /// @param amount the erc20 undelegation amount
    /// @param nftIds the array of nft ids to undelegate
    function undelegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function that unlocks user funds in completed proposals
    /// @param user the user whose funds to unlock
    /// @param voteType the type of vote
    function unlock(address user, VoteType voteType) external;

    /// @notice The function to unlock user funds from completed proposals
    /// @param proposalIds the array of proposals to unlock the funds in
    /// @param user the user to unlock the funds of
    /// @param voteType the type of vote
    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        VoteType voteType
    ) external;

    /// @notice Execute proposal
    /// @param proposalId Proposal ID
    function execute(uint256 proposalId) external;

    /// @notice The function for claiming rewards from executed proposals
    /// @param proposalIds the array of proposal ids
    function claimRewards(uint256[] calldata proposalIds) external;

    /// @notice The function for changing description url
    /// @param newDescriptionURL the string with new url
    function editDescriptionURL(string calldata newDescriptionURL) external;

    /// @notice The function for changing verifier address
    /// @param newVerifier the address of verifier
    function changeVerifier(address newVerifier) external;

    /// @notice The function for changing voting modifiers
    /// @param regularModifier the new regular modifier value
    /// @param expertModifier the new expert modifier value
    function changeVoteModifiers(uint256 regularModifier, uint256 expertModifier) external;

    /// @notice The function for changing the KYC restriction
    /// @param onlyBABT true id restriction is needed
    function changeBABTRestriction(bool onlyBABT) external;

    /// @notice The function for setting address of nft multiplier contract
    /// @param nftMultiplierAddress the address of nft multiplier
    function setNftMultiplierAddress(address nftMultiplierAddress) external;

    /// @notice The function for saving ipfs hash of off-chain proposal results
    /// @param resultsHash the ipfs results hash
    /// @param signature the signature from verifier
    function saveOffchainResults(string calldata resultsHash, bytes calldata signature) external;

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
    /// 4 -`SucceededFor`, successful proposal with votes for but not executed yet
    /// 5 -`SucceededAgainst`, successful proposal with votes against but not executed yet
    /// 6 -`Locked`, successful proposal but temporarily locked for execution
    /// 7 -`ExecutedFor`, executed proposal with the required number of votes on for step
    /// 8 -`ExecutedAgainst`, executed proposal with the required number of votes on against step
    /// 9 -`Undefined`, nonexistent proposal
    function getProposalState(uint256 proposalId) external view returns (ProposalState);

    /// @notice The function for getting total votes in the proposal by one voter
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param voteType the type of vote
    function getTotalVotes(
        uint256 proposalId,
        address voter,
        VoteType voteType
    ) external view returns (uint256, uint256, uint256, uint256);

    /// @notice The function to get required quorum of proposal
    /// @param proposalId the id of proposal
    /// @return the required number for votes to reach the quorum
    function getProposalRequiredQuorum(uint256 proposalId) external view returns (uint256);

    /// @notice The function to get information about user's votes
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param voteType the type of vote
    /// @return `VoteInfoView` array
    function getUserVotes(
        uint256 proposalId,
        address voter,
        VoteType voteType
    ) external view returns (VoteInfoView memory);

    /// @notice The function to get withdrawable assets
    /// @param delegator the delegator address
    /// @param delegatee the delegatee address
    /// @return `Arguments`: erc20 amount, array nft ids
    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view returns (uint256, uint256[] memory);

    /// @notice The function to get on-chain and off-chain rewards
    /// @param user the address of the user whose rewards are required
    /// @param proposalIds the list of proposal ids
    /// @return the list of rewards
    function getPendingRewards(
        address user,
        uint256[] calldata proposalIds
    ) external view returns (PendingRewardsView memory);

    /// @notice The function to get delegator staking rewards from all micropools
    /// @param delegator the address of the delegator
    /// @return the list of rewards
    function getDelegatorStakingRewards(
        address delegator
    ) external view returns (UserStakeRewardsView[] memory);

    /// @notice The function to get off-chain voting results
    /// @return resultsHash the ipfs hash
    function getOffchainResultsHash() external view returns (string memory resultsHash);

    /// @notice The function to get the sign hash from string resultsHash, chainid, govPool address
    /// @param resultsHash the ipfs hash
    /// @return bytes32 hash
    function getOffchainSignHash(string calldata resultsHash) external view returns (bytes32);

    /// @notice The function to get off-chain verifier address
    /// @return address of verifier
    function getVerifier() external view returns (address);

    /// @notice The function to get expert status of a voter
    /// @return address of a person, who votes
    function getExpertStatus(address user) external view returns (bool);

    /// @notice The function to get current vote modifier
    /// @return `Arguments`: regular modifier, expert modifier (with 18 precision decimals)
    function getVoteModifiers() external view returns (uint256, uint256);

    /// @notice The function to get current vote modifier for particular user
    /// @param user the address of the user
    /// @return uint256 the modifier with 18 precision decimals
    function getVoteModifierForUser(address user) external view returns (uint256);
}
