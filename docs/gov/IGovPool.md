# IGovPool

## Interface Description


License: MIT

## 

```solidity
interface IGovPool
```

This is the Governance pool contract. This contract is the third contract the user can deploy through
the factory. The users can participate in proposal's creation, voting and execution processes
## Enums info

### ProposalState

```solidity
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
```

The enum that holds information about proposal state


Parameters:

| Name                     | Description                                                               |
| :----------------------- | :------------------------------------------------------------------------ |
| Voting                   | the proposal is in voting state                                           |
| WaitingForVotingTransfer | the proposal is approved and waiting for transfer to validators contract  |
| ValidatorVoting          | the proposal is in validators voting state                                |
| Defeated                 | the proposal is defeated                                                  |
| SucceededFor             | the proposal is succeeded on for step                                     |
| SucceededAgainst         | the proposal is succeeded on against step                                 |
| Locked                   | the proposal is locked                                                    |
| ExecutedFor              | the proposal is executed on for step                                      |
| ExecutedAgainst          | the proposal is executed on against step                                  |
| Undefined                | the proposal is undefined                                                 |

### RewardType

```solidity
enum RewardType {
	 Create,
	 Vote,
	 Execute,
	 SaveOffchainResults
}
```

The enum that holds information about reward type


Parameters:

| Name                | Description                                  |
| :------------------ | :------------------------------------------- |
| Create              | the reward type for proposal creation        |
| Vote                | the reward type for voting for proposal      |
| Execute             | the reward type for proposal execution       |
| SaveOffchainResults | the reward type for saving off-chain results |

### VoteType

```solidity
enum VoteType {
	 PersonalVote,
	 MicropoolVote,
	 DelegatedVote,
	 TreasuryVote
}
```

The enum that holds information about vote type


Parameters:

| Name          | Description                         |
| :------------ | :---------------------------------- |
| PersonalVote  | the vote type for personal voting   |
| MicropoolVote | the vote type for micropool voting  |
| DelegatedVote | the vote type for delegated voting  |
| TreasuryVote  | the vote type for treasury voting   |

## Structs info

### Dependencies

```solidity
struct Dependencies {
	address settingsAddress;
	address userKeeperAddress;
	address payable validatorsAddress;
	address expertNftAddress;
	address nftMultiplierAddress;
	address votePowerAddress;
}
```

The struct that holds information about dependencies


Parameters:

| Name                 | Type            | Description                             |
| :------------------- | :-------------- | :-------------------------------------- |
| settingsAddress      | address         | the address of settings contract        |
| userKeeperAddress    | address         | the address of user keeper contract     |
| validatorsAddress    | address payable | the address of validators contract      |
| expertNftAddress     | address         | the address of expert nft contract      |
| nftMultiplierAddress | address         | the address of nft multiplier contract  |
| votePowerAddress     | address         | the address of vote power contract      |

### ProposalCore

```solidity
struct ProposalCore {
	IGovSettings.ProposalSettings settings;
	uint64 voteEnd;
	uint64 executeAfter;
	bool executed;
	uint256 votesFor;
	uint256 votesAgainst;
	uint256 rawVotesFor;
	uint256 rawVotesAgainst;
	uint256 nftPowerSnapshotId;
	uint256 givenRewards;
}
```

The struct holds core properties of proposal


Parameters:

| Name               | Type                                 | Description                                                                        |
| :----------------- | :----------------------------------- | :--------------------------------------------------------------------------------- |
| settings           | struct IGovSettings.ProposalSettings | the struct that holds information about settings of the proposal                   |
| voteEnd            | uint64                               | the timestamp of voting end for the proposal                                       |
| executeAfter       | uint64                               | the timestamp of execution in seconds after voting end                             |
| executed           | bool                                 | the boolean indicating whether the proposal has been executed                      |
| votesFor           | uint256                              | the total number of votes for the proposal from all voters                         |
| votesAgainst       | uint256                              | the total number of votes against the proposal from all voters                     |
| rawVotesFor        | uint256                              | the total number of votes for the proposal from all voters before the formula      |
| rawVotesAgainst    | uint256                              | the total number of votes against the proposal from all voters before the formula  |
| nftPowerSnapshotId | uint256                              | the id of nft power snapshot                                                       |
| givenRewards       | uint256                              | the amount of rewards payable after the proposal execution                         |

### ProposalAction

```solidity
struct ProposalAction {
	address executor;
	uint256 value;
	bytes data;
}
```

The struct holds information about proposal action


Parameters:

| Name     | Type    | Description                                                             |
| :------- | :------ | :---------------------------------------------------------------------- |
| executor | address | the address of call's target, bounded by index with `value` and `data`  |
| value    | uint256 | the eth value for call, bounded by index with `executor` and `data`     |
| data     | bytes   | the of call data, bounded by index with `executor` and `value`          |

### Proposal

```solidity
struct Proposal {
	IGovPool.ProposalCore core;
	string descriptionURL;
	IGovPool.ProposalAction[] actionsOnFor;
	IGovPool.ProposalAction[] actionsOnAgainst;
}
```

The struct holds all information about proposal


Parameters:

| Name             | Type                             | Description                                                          |
| :--------------- | :------------------------------- | :------------------------------------------------------------------- |
| core             | struct IGovPool.ProposalCore     | the struct that holds information about core properties of proposal  |
| descriptionURL   | string                           | the string with link to IPFS doc with proposal description           |
| actionsOnFor     | struct IGovPool.ProposalAction[] | the array of structs with information about actions on for step      |
| actionsOnAgainst | struct IGovPool.ProposalAction[] | the array of structs with information about actions on against step  |

### ProposalView

```solidity
struct ProposalView {
	IGovPool.Proposal proposal;
	IGovValidators.ExternalProposal validatorProposal;
	IGovPool.ProposalState proposalState;
	uint256 requiredQuorum;
	uint256 requiredValidatorsQuorum;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name                     | Type                                   | Description                                                                     |
| :----------------------- | :------------------------------------- | :------------------------------------------------------------------------------ |
| proposal                 | struct IGovPool.Proposal               | the `Proposal` struct                                                           |
| validatorProposal        | struct IGovValidators.ExternalProposal | the `ExternalProposal` struct                                                   |
| proposalState            | enum IGovPool.ProposalState            | the value from enum `ProposalState`, that shows proposal state at current time  |
| requiredQuorum           | uint256                                | the required votes amount to confirm the proposal                               |
| requiredValidatorsQuorum | uint256                                | the the required validator votes to confirm the proposal                        |

### RawVote

```solidity
struct RawVote {
	uint256 tokensVoted;
	uint256 totalVoted;
	EnumerableSet.UintSet nftsVoted;
}
```

The struct that holds information about the typed vote (only for internal needs)


Parameters:

| Name        | Type                         | Description                                                                       |
| :---------- | :--------------------------- | :-------------------------------------------------------------------------------- |
| tokensVoted | uint256                      | the total erc20 amount voted from one user for the proposal before the formula    |
| totalVoted  | uint256                      | the total power of typed votes from one user for the proposal before the formula  |
| nftsVoted   | struct EnumerableSet.UintSet | the set of ids of nfts voted from one user for the proposal                       |

### VoteInfo

```solidity
struct VoteInfo {
	mapping(IGovPool.VoteType => struct IGovPool.RawVote) rawVotes;
	bool isVoteFor;
	uint256 totalVoted;
	uint256 totalRawVoted;
}
```

The struct that holds information about the global vote properties (only for internal needs)


Parameters:

| Name          | Type                                                       | Description                                                                |
| :------------ | :--------------------------------------------------------- | :------------------------------------------------------------------------- |
| rawVotes      | mapping(enum IGovPool.VoteType => struct IGovPool.RawVote) | matching vote types with their infos                                       |
| isVoteFor     | bool                                                       | the boolean flag that indicates whether the vote is "for" the proposal     |
| totalVoted    | uint256                                                    | the total power of votes from one user for the proposal after the formula  |
| totalRawVoted | uint256                                                    | the total power of votes from one user for the proposal before the formula |

### VoteInfoView

```solidity
struct VoteInfoView {
	bool isVoteFor;
	uint256 totalVoted;
	uint256 tokensVoted;
	uint256 totalRawVoted;
	uint256[] nftsVoted;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name          | Type      | Description                                                                       |
| :------------ | :-------- | :-------------------------------------------------------------------------------- |
| isVoteFor     | bool      | the boolean flag that indicates whether the vote is "for" the proposal            |
| totalVoted    | uint256   | the total power of votes from one user for the proposal after the formula         |
| tokensVoted   | uint256   | the total erc20 amount voted from one user for the proposal before the formula    |
| totalRawVoted | uint256   | the total power of typed votes from one user for the proposal before the formula  |
| nftsVoted     | uint256[] | the set of ids of nfts voted from one user for the proposal                       |

### DelegatorRewards

```solidity
struct DelegatorRewards {
	address[] rewardTokens;
	bool[] isVoteFor;
	bool[] isClaimed;
	uint256[] expectedRewards;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name            | Type      | Description                                                          |
| :-------------- | :-------- | :------------------------------------------------------------------- |
| rewardTokens    | address[] | the list of reward tokens                                            |
| isVoteFor       | bool[]    | the list of flags indicating whether the vote is "for" the proposal  |
| isClaimed       | bool[]    | the list of flags indicating whether the rewards have been claimed   |
| expectedRewards | uint256[] | the list of expected rewards to be claimed                           |

### DelegatorInfo

```solidity
struct DelegatorInfo {
	uint256[] delegationTimes;
	uint256[][] nftIds;
	uint256[] tokenAmounts;
	mapping(uint256 => bool) isClaimed;
}
```

The struct that holds information about the delegator (only for internal needs)


Parameters:

| Name            | Type                     | Description                                                                    |
| :-------------- | :----------------------- | :----------------------------------------------------------------------------- |
| delegationTimes | uint256[]                | the list of timestamps when delegated amount was changed                       |
| nftIds          | uint256[][]              | lists of delegated nfts in corresponding timestamps                            |
| tokenAmounts    | uint256[]                | the list of delegated token amounts in corresponding timestamps                |
| isClaimed       | mapping(uint256 => bool) | matching proposals ids with flags indicating whether rewards have been claimed |

### PendingRewards

```solidity
struct PendingRewards {
	mapping(uint256 => bool) areVotingRewardsSet;
	mapping(uint256 => uint256) staticRewards;
	mapping(uint256 => IGovPool.VotingRewards) votingRewards;
	mapping(address => uint256) offchainRewards;
	EnumerableSet.AddressSet offchainTokens;
}
```

The struct that holds reward properties (only for internal needs)


Parameters:

| Name                | Type                                              | Description                                                                                                               |
| :------------------ | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------ |
| areVotingRewardsSet | mapping(uint256 => bool)                          | matching proposals ids with flags indicating whether voting rewards have been set during the personal or micropool claim  |
| staticRewards       | mapping(uint256 => uint256)                       | matching proposal ids to their static rewards                                                                             |
| votingRewards       | mapping(uint256 => struct IGovPool.VotingRewards) | matching proposal ids to their voting rewards                                                                             |
| offchainRewards     | mapping(address => uint256)                       | matching off-chain token addresses to their rewards                                                                       |
| offchainTokens      | struct EnumerableSet.AddressSet                   | the list of off-chain token addresses                                                                                     |

### UserInfo

```solidity
struct UserInfo {
	mapping(uint256 => IGovPool.VoteInfo) voteInfos;
	IGovPool.PendingRewards pendingRewards;
	mapping(address => IGovPool.DelegatorInfo) delegatorInfos;
	EnumerableSet.UintSet votedInProposals;
	EnumerableSet.UintSet restrictedProposals;
}
```

The struct that holds the user info (only for internal needs)


Parameters:

| Name                | Type                                              | Description                                         |
| :------------------ | :------------------------------------------------ | :-------------------------------------------------- |
| voteInfos           | mapping(uint256 => struct IGovPool.VoteInfo)      | matching proposal ids to their infos                |
| pendingRewards      | struct IGovPool.PendingRewards                    | user's pending rewards                              |
| delegatorInfos      | mapping(address => struct IGovPool.DelegatorInfo) | matching delegators to their infos                  |
| votedInProposals    | struct EnumerableSet.UintSet                      | the list of active proposals user voted in          |
| restrictedProposals | struct EnumerableSet.UintSet                      | the list of proposals user is restricted to vote in |

### VotingRewards

```solidity
struct VotingRewards {
	uint256 personal;
	uint256 micropool;
	uint256 treasury;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name      | Type    | Description                       |
| :-------- | :------ | :-------------------------------- |
| personal  | uint256 | rewards for the personal voting   |
| micropool | uint256 | rewards for the micropool voting  |
| treasury  | uint256 | rewards for the treasury voting   |

### PendingRewardsView

```solidity
struct PendingRewardsView {
	address[] onchainTokens;
	uint256[] staticRewards;
	IGovPool.VotingRewards[] votingRewards;
	uint256[] offchainRewards;
	address[] offchainTokens;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name            | Type                            | Description                           |
| :-------------- | :------------------------------ | :------------------------------------ |
| onchainTokens   | address[]                       | the list of on-chain token addresses  |
| staticRewards   | uint256[]                       | the list of static rewards            |
| votingRewards   | struct IGovPool.VotingRewards[] | the list of voting rewards            |
| offchainRewards | uint256[]                       | the list of off-chain rewards         |
| offchainTokens  | address[]                       | the list of off-chain token addresses |

### CreditInfo

```solidity
struct CreditInfo {
	address[] tokenList;
	mapping(address => IGovPool.TokenCreditInfo) tokenInfo;
}
```

The struct is used to hold info about validators monthly withdrawal credit


Parameters:

| Name      | Type                                                | Description                                         |
| :-------- | :-------------------------------------------------- | :-------------------------------------------------- |
| tokenList | address[]                                           | the list of token allowed to withdraw               |
| tokenInfo | mapping(address => struct IGovPool.TokenCreditInfo) | the mapping token => withdrawals history and limits |

### TokenCreditInfo

```solidity
struct TokenCreditInfo {
	uint256 monthLimit;
	uint256[] cumulativeAmounts;
	uint256[] timestamps;
}
```

The struct is used to hold info about limits and withdrawals history


Parameters:

| Name              | Type      | Description                               |
| :---------------- | :-------- | :---------------------------------------- |
| monthLimit        | uint256   | the monthly withdraw limit for the token  |
| cumulativeAmounts | uint256[] | the list of amounts withdrawn             |
| timestamps        | uint256[] | the list of timestamps of withdraws       |

### CreditInfoView

```solidity
struct CreditInfoView {
	address token;
	uint256 monthLimit;
	uint256 currentWithdrawLimit;
}
```

The struct is used to return info about current credit state


Parameters:

| Name                 | Type    | Description                                       |
| :------------------- | :------ | :------------------------------------------------ |
| token                | address | the token address                                 |
| monthLimit           | uint256 | the amount that validator could withdraw monthly  |
| currentWithdrawLimit | uint256 | the amount that validators could withdraw now     |

### OffChain

```solidity
struct OffChain {
	address verifier;
	string resultsHash;
	mapping(bytes32 => bool) usedHashes;
}
```

The struct that holds off-chain properties (only for internal needs)


Parameters:

| Name        | Type                     | Description                          |
| :---------- | :----------------------- | :----------------------------------- |
| verifier    | address                  | the off-chain verifier address       |
| resultsHash | string                   | the ipfs results hash                |
| usedHashes  | mapping(bytes32 => bool) | matching hashes to their usage state |

## Functions info

### getHelperContracts (0x485f4044)

```solidity
function getHelperContracts()
    external
    view
    returns (
        address settings,
        address userKeeper,
        address validators,
        address poolRegistry,
        address votePower
    )
```

The function to get helper contract of this pool


Return values:

| Name         | Type    | Description            |
| :----------- | :------ | :--------------------- |
| settings     | address | settings address       |
| userKeeper   | address | user keeper address    |
| validators   | address | validators address     |
| poolRegistry | address | pool registry address  |
| votePower    | address | vote power address     |

### getNftContracts (0x80326e95)

```solidity
function getNftContracts()
    external
    view
    returns (
        address nftMultiplier,
        address expertNft,
        address dexeExpertNft,
        address babt
    )
```

The function to get the nft contracts of this pool


Return values:

| Name          | Type    | Description                      |
| :------------ | :------ | :------------------------------- |
| nftMultiplier | address | rewards multiplier nft contract  |
| expertNft     | address | local expert nft contract        |
| dexeExpertNft | address | global expert nft contract       |
| babt          | address | binance bound token              |

### createProposal (0xda1c6cfa)

```solidity
function createProposal(
    string calldata descriptionURL,
    IGovPool.ProposalAction[] calldata actionsOnFor,
    IGovPool.ProposalAction[] calldata actionsOnAgainst
) external
```

Create proposal


Parameters:

| Name             | Type                             | Description                                                         |
| :--------------- | :------------------------------- | :------------------------------------------------------------------ |
| descriptionURL   | string                           | IPFS url to the proposal's description                              |
| actionsOnFor     | struct IGovPool.ProposalAction[] | the array of structs with information about actions on for step     |
| actionsOnAgainst | struct IGovPool.ProposalAction[] | the array of structs with information about actions on against step |

### moveProposalToValidators (0x2db47bdd)

```solidity
function moveProposalToValidators(uint256 proposalId) external
```

Move proposal from internal voting to `Validators` contract


Parameters:

| Name       | Type    | Description |
| :--------- | :------ | :---------- |
| proposalId | uint256 | Proposal ID |

### vote (0x544df02c)

```solidity
function vote(
    uint256 proposalId,
    bool isVoteFor,
    uint256 voteAmount,
    uint256[] calldata voteNftIds
) external
```

The function for voting for proposal with own tokens


Parameters:

| Name       | Type      | Description                                           |
| :--------- | :-------- | :---------------------------------------------------- |
| proposalId | uint256   | the id of the proposal                                |
| isVoteFor  | bool      | the bool flag for voting for or against the proposal  |
| voteAmount | uint256   | the erc20 vote amount                                 |
| voteNftIds | uint256[] | the nft ids that will be used in voting               |

### cancelVote (0xbacbe2da)

```solidity
function cancelVote(uint256 proposalId) external
```

The function for canceling vote


Parameters:

| Name       | Type    | Description                                           |
| :--------- | :------ | :---------------------------------------------------- |
| proposalId | uint256 | the id of the proposal to cancel all votes from which |

### deposit (0xde3ab781)

```solidity
function deposit(uint256 amount, uint256[] calldata nftIds) external
```

The function for depositing tokens to the pool


Parameters:

| Name   | Type      | Description                     |
| :----- | :-------- | :------------------------------ |
| amount | uint256   | the erc20 deposit amount        |
| nftIds | uint256[] | the array of nft ids to deposit |

### withdraw (0xfb8c5ef0)

```solidity
function withdraw(
    address receiver,
    uint256 amount,
    uint256[] calldata nftIds
) external
```

The function for withdrawing deposited tokens


Parameters:

| Name     | Type      | Description                      |
| :------- | :-------- | :------------------------------- |
| receiver | address   | the withdrawal receiver address  |
| amount   | uint256   | the erc20 withdrawal amount      |
| nftIds   | uint256[] | the array of nft ids to withdraw |

### delegate (0x46d0b0b9)

```solidity
function delegate(
    address delegatee,
    uint256 amount,
    uint256[] calldata nftIds
) external
```

The function for delegating tokens


Parameters:

| Name      | Type      | Description                                                                 |
| :-------- | :-------- | :-------------------------------------------------------------------------- |
| delegatee | address   | the target address for delegation (person who will receive the delegation)  |
| amount    | uint256   | the erc20 delegation amount                                                 |
| nftIds    | uint256[] | the array of nft ids to delegate                                            |

### delegateTreasury (0x39588f1e)

```solidity
function delegateTreasury(
    address delegatee,
    uint256 amount,
    uint256[] calldata nftIds
) external
```

The function for delegating tokens from treasury


Parameters:

| Name      | Type      | Description                                                                 |
| :-------- | :-------- | :-------------------------------------------------------------------------- |
| delegatee | address   | the target address for delegation (person who will receive the delegation)  |
| amount    | uint256   | the erc20 delegation amount                                                 |
| nftIds    | uint256[] | the array of nft ids to delegate                                            |

### undelegate (0x7810436a)

```solidity
function undelegate(
    address delegatee,
    uint256 amount,
    uint256[] calldata nftIds
) external
```

The function for undelegating delegated tokens


Parameters:

| Name      | Type      | Description                                                       |
| :-------- | :-------- | :---------------------------------------------------------------- |
| delegatee | address   | the undelegation target address (person who will be undelegated)  |
| amount    | uint256   | the erc20 undelegation amount                                     |
| nftIds    | uint256[] | the array of nft ids to undelegate                                |

### undelegateTreasury (0xb6b90df4)

```solidity
function undelegateTreasury(
    address delegatee,
    uint256 amount,
    uint256[] calldata nftIds
) external
```

The function for undelegating delegated tokens from treasury


Parameters:

| Name      | Type      | Description                                                       |
| :-------- | :-------- | :---------------------------------------------------------------- |
| delegatee | address   | the undelegation target address (person who will be undelegated)  |
| amount    | uint256   | the erc20 undelegation amount                                     |
| nftIds    | uint256[] | the array of nft ids to undelegate                                |

### unlock (0x2f6c493c)

```solidity
function unlock(address user) external
```

The function that unlocks user funds in completed proposals


Parameters:

| Name | Type    | Description                    |
| :--- | :------ | :----------------------------- |
| user | address | the user whose funds to unlock |

### execute (0xfe0d94c1)

```solidity
function execute(uint256 proposalId) external
```

Execute proposal


Parameters:

| Name       | Type    | Description |
| :--------- | :------ | :---------- |
| proposalId | uint256 | Proposal ID |

### claimRewards (0x0520537f)

```solidity
function claimRewards(uint256[] calldata proposalIds, address user) external
```

The function for claiming rewards from executed proposals


Parameters:

| Name        | Type      | Description                |
| :---------- | :-------- | :------------------------- |
| proposalIds | uint256[] | the array of proposal ids  |
| user        | address   | the address of the user    |

### claimMicropoolRewards (0x7b0e1203)

```solidity
function claimMicropoolRewards(
    uint256[] calldata proposalIds,
    address delegator,
    address delegatee
) external
```

The function for claiming micropool rewards from executed proposals


Parameters:

| Name        | Type      | Description                   |
| :---------- | :-------- | :---------------------------- |
| proposalIds | uint256[] | the array of proposal ids     |
| delegator   | address   | the address of the delegator  |
| delegatee   | address   | the address of the delegatee  |

### changeVotePower (0xcfd9c3c3)

```solidity
function changeVotePower(address votePower) external
```

The function to change vote power contract


Parameters:

| Name      | Type    | Description                               |
| :-------- | :------ | :---------------------------------------- |
| votePower | address | new contract for the voting power formula |

### editDescriptionURL (0x0dbf1c47)

```solidity
function editDescriptionURL(string calldata newDescriptionURL) external
```

The function for changing description url


Parameters:

| Name              | Type   | Description             |
| :---------------- | :----- | :---------------------- |
| newDescriptionURL | string | the string with new url |

### changeVerifier (0xcf04fb94)

```solidity
function changeVerifier(address newVerifier) external
```

The function for changing verifier address


Parameters:

| Name        | Type    | Description             |
| :---------- | :------ | :---------------------- |
| newVerifier | address | the address of verifier |

### setCreditInfo (0xbaa7652f)

```solidity
function setCreditInfo(
    address[] calldata tokens,
    uint256[] calldata amounts
) external
```

The function for setting validators credit limit


Parameters:

| Name    | Type      | Description                             |
| :------ | :-------- | :-------------------------------------- |
| tokens  | address[] | the list of tokens to credit            |
| amounts | uint256[] | the list of amounts to credit per month |

### transferCreditAmount (0xc1e09f97)

```solidity
function transferCreditAmount(
    address[] memory tokens,
    uint256[] memory amounts,
    address destination
) external
```

The function for fulfilling transfer request from validators


Parameters:

| Name        | Type      | Description                  |
| :---------- | :-------- | :--------------------------- |
| tokens      | address[] | the list of tokens to send   |
| amounts     | uint256[] | the list of amounts to send  |
| destination | address   | the address to send tokens   |

### changeBABTRestriction (0x2050a31b)

```solidity
function changeBABTRestriction(bool onlyBABT) external
```

The function for changing the KYC restriction


Parameters:

| Name     | Type | Description                   |
| :------- | :--- | :---------------------------- |
| onlyBABT | bool | true id restriction is needed |

### setNftMultiplierAddress (0xa43040eb)

```solidity
function setNftMultiplierAddress(address nftMultiplierAddress) external
```

The function for setting address of nft multiplier contract


Parameters:

| Name                 | Type    | Description                   |
| :------------------- | :------ | :---------------------------- |
| nftMultiplierAddress | address | the address of nft multiplier |

### saveOffchainResults (0x41c47e3e)

```solidity
function saveOffchainResults(
    string calldata resultsHash,
    bytes calldata signature
) external
```

The function for saving ipfs hash of off-chain proposal results


Parameters:

| Name        | Type   | Description                 |
| :---------- | :----- | :-------------------------- |
| resultsHash | string | the ipfs results hash       |
| signature   | bytes  | the signature from verifier |

### getProposals (0x5e3b4365)

```solidity
function getProposals(
    uint256 offset,
    uint256 limit
) external view returns (IGovPool.ProposalView[] memory)
```

The paginated function for getting proposal info list


Parameters:

| Name   | Type    | Description                         |
| :----- | :------ | :---------------------------------- |
| offset | uint256 | the proposal starting index         |
| limit  | uint256 | the number of proposals to observe  |


Return values:

| Name | Type                           | Description          |
| :--- | :----------------------------- | :------------------- |
| [0]  | struct IGovPool.ProposalView[] | `ProposalView` array |

### getProposalState (0x9080936f)

```solidity
function getProposalState(
    uint256 proposalId
) external view returns (IGovPool.ProposalState)
```



Parameters:

| Name       | Type    | Description  |
| :--------- | :------ | :----------- |
| proposalId | uint256 | Proposal ID  |


Return values:

| Name | Type                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :--- | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0]  | enum IGovPool.ProposalState | `ProposalState`: 0 -`Voting`, proposal where addresses can vote 1 -`WaitingForVotingTransfer`, approved proposal that waiting `moveProposalToValidators()` call 2 -`ValidatorVoting`, validators voting 3 -`Defeated`, proposal where voting time is over and proposal defeated on first or second step 4 -`SucceededFor`, successful proposal with votes for but not executed yet 5 -`SucceededAgainst`, successful proposal with votes against but not executed yet 6 -`Locked`, successful proposal but temporarily locked for execution 7 -`ExecutedFor`, executed proposal with the required number of votes on for step 8 -`ExecutedAgainst`, executed proposal with the required number of votes on against step 9 -`Undefined`, nonexistent proposal |

### getUserActiveProposalsCount (0x38fa211c)

```solidity
function getUserActiveProposalsCount(
    address user
) external view returns (uint256)
```

The function for getting user's active proposals count


Parameters:

| Name | Type    | Description          |
| :--- | :------ | :------------------- |
| user | address | the address of user  |


Return values:

| Name | Type    | Description                    |
| :--- | :------ | :----------------------------- |
| [0]  | uint256 | the number of active proposals |

### getTotalVotes (0x6545ea83)

```solidity
function getTotalVotes(
    uint256 proposalId,
    address voter,
    IGovPool.VoteType voteType
) external view returns (uint256, uint256, uint256, bool)
```

The function for getting total raw votes in the proposal by one voter


Parameters:

| Name       | Type                   | Description           |
| :--------- | :--------------------- | :-------------------- |
| proposalId | uint256                | the id of proposal    |
| voter      | address                | the address of voter  |
| voteType   | enum IGovPool.VoteType | the type of vote      |


Return values:

| Name | Type    | Description                                                                                          |
| :--- | :------ | :--------------------------------------------------------------------------------------------------- |
| [0]  | uint256 | `Arguments`: core raw votes for, core raw votes against, user typed raw votes, is vote for indicator |

### getProposalRequiredQuorum (0xda437f37)

```solidity
function getProposalRequiredQuorum(
    uint256 proposalId
) external view returns (uint256)
```

The function to get required quorum of proposal


Parameters:

| Name       | Type    | Description         |
| :--------- | :------ | :------------------ |
| proposalId | uint256 | the id of proposal  |


Return values:

| Name | Type    | Description                                       |
| :--- | :------ | :------------------------------------------------ |
| [0]  | uint256 | the required number for votes to reach the quorum |

### getUserVotes (0x466d7af2)

```solidity
function getUserVotes(
    uint256 proposalId,
    address voter,
    IGovPool.VoteType voteType
) external view returns (IGovPool.VoteInfoView memory)
```

The function to get information about user's votes


Parameters:

| Name       | Type                   | Description           |
| :--------- | :--------------------- | :-------------------- |
| proposalId | uint256                | the id of proposal    |
| voter      | address                | the address of voter  |
| voteType   | enum IGovPool.VoteType | the type of vote      |


Return values:

| Name | Type                         | Description          |
| :--- | :--------------------------- | :------------------- |
| [0]  | struct IGovPool.VoteInfoView | `VoteInfoView` array |

### getWithdrawableAssets (0x7ecd20bb)

```solidity
function getWithdrawableAssets(
    address delegator
) external view returns (uint256, uint256[] memory)
```

The function to get withdrawable assets


Parameters:

| Name      | Type    | Description            |
| :-------- | :------ | :--------------------- |
| delegator | address | the delegator address  |


Return values:

| Name | Type    | Description                              |
| :--- | :------ | :--------------------------------------- |
| [0]  | uint256 | `Arguments`: erc20 amount, array nft ids |

### getPendingRewards (0x566aff6a)

```solidity
function getPendingRewards(
    address user,
    uint256[] calldata proposalIds
) external view returns (IGovPool.PendingRewardsView memory)
```

The function to get on-chain and off-chain rewards


Parameters:

| Name        | Type      | Description                                         |
| :---------- | :-------- | :-------------------------------------------------- |
| user        | address   | the address of the user whose rewards are required  |
| proposalIds | uint256[] | the list of proposal ids                            |


Return values:

| Name | Type                               | Description         |
| :--- | :--------------------------------- | :------------------ |
| [0]  | struct IGovPool.PendingRewardsView | the list of rewards |

### getDelegatorRewards (0x529285af)

```solidity
function getDelegatorRewards(
    uint256[] calldata proposalIds,
    address delegator,
    address delegatee
) external view returns (IGovPool.DelegatorRewards memory)
```

The function to get delegator staking rewards from all micropools


Parameters:

| Name        | Type      | Description                   |
| :---------- | :-------- | :---------------------------- |
| proposalIds | uint256[] | the list of proposal ids      |
| delegator   | address   | the address of the delegator  |
| delegatee   | address   | the address of the delegatee  |


Return values:

| Name | Type                             | Description               |
| :--- | :------------------------------- | :------------------------ |
| [0]  | struct IGovPool.DelegatorRewards | rewards delegator rewards |

### getCreditInfo (0xf06817cf)

```solidity
function getCreditInfo()
    external
    view
    returns (IGovPool.CreditInfoView[] memory)
```

The function to get info about validators credit limit


Return values:

| Name | Type                             | Description              |
| :--- | :------------------------------- | :----------------------- |
| [0]  | struct IGovPool.CreditInfoView[] | the list of credit infos |

### getOffchainInfo (0xb3a72fc4)

```solidity
function getOffchainInfo()
    external
    view
    returns (address validator, string memory resultsHash)
```

The function to get off-chain info


Return values:

| Name        | Type    | Description           |
| :---------- | :------ | :-------------------- |
| validator   | address | the verifier address  |
| resultsHash | string  | the ipfs hash         |

### getOffchainSignHash (0x63d1cd0f)

```solidity
function getOffchainSignHash(
    string calldata resultsHash
) external view returns (bytes32)
```

The function to get the sign hash from string resultsHash, chainid, govPool address


Parameters:

| Name        | Type   | Description    |
| :---------- | :----- | :------------- |
| resultsHash | string | the ipfs hash  |


Return values:

| Name | Type    | Description  |
| :--- | :------ | :----------- |
| [0]  | bytes32 | bytes32 hash |

### getExpertStatus (0x0660b478)

```solidity
function getExpertStatus(address user) external view returns (bool)
```

The function to get expert status of a voter


Return values:

| Name | Type | Description                    |
| :--- | :--- | :----------------------------- |
| [0]  | bool | address of a person, who votes |

### coreProperties (0xe9bbc80c)

```solidity
function coreProperties() external view returns (ICoreProperties)
```

The function to get core properties


Return values:

| Name | Type                     | Description                 |
| :--- | :----------------------- | :-------------------------- |
| [0]  | contract ICoreProperties | `ICoreProperties` interface |
