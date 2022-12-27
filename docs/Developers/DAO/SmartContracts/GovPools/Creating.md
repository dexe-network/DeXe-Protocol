# 🏗️ Creating

DAO Pool is deploying using ***`deployGovPool()`*** function on `PoolFactory`.

```solidity
function deployGovPool(GovPoolDeployParams calldata parameters) external;
```
- parameters - the pool deploy parameters

```solidity
struct GovPoolDeployParams {
    SettingsDeployParams settingsParams;
    ValidatorsDeployParams validatorsParams;
    UserKeeperDeployParams userKeeperParams;
    address nftMultiplierAddress;
    string descriptionURL;
    string name;
}
```
- nftMultiplierAddress - ...
- descriptionURL - the description of the pool
- name - the name of the pool

Structures in the parameters:


```solidity
struct ValidatorsDeployParams {
    string name;
    string symbol;
    uint64 duration;
    uint128 quorum;
    address[] validators;
    uint256[] balances;
}
```

```solidity
struct UserKeeperDeployParams {
    address tokenAddress;
    address nftAddress;
    uint256 totalPowerInTokens;
    uint256 nftsTotalSupply;
}
```

```solidity
struct SettingsDeployParams {
    IGovSettings.ProposalSettings[] proposalSettings;
    address[] additionalProposalExecutors;
}
```
`ProposalSettings` struct holds information about settings for proposal type

```solidity
struct ProposalSettings {
    bool earlyCompletion;
    bool delegatedVotingAllowed;
    bool validatorsVote;
    uint64 duration;
    uint64 durationValidators;
    uint128 quorum;
    uint128 quorumValidators;
    uint256 minVotesForVoting;
    uint256 minVotesForCreating;
    address rewardToken;
    uint256 creationReward;
    uint256 executionReward;
    uint256 voteRewardsCoefficient;
    string executorDescription;
}
```
- ***earlyCompletion*** - the boolean flag, if true the voting completes as soon as the quorum is reached
- ***delegatedVotingAllowed*** - the boolean flag, if true then delegators can vote with their own delegated tokens
- ***validatorsVote*** - the boolean flag
    - if *true* **->** voting will have an additional validators step
- ***duration*** - the duration of voting in seconds
- ***durationValidators*** - the duration of validators voting in seconds
- ***quorum*** - the percentage of total votes supply (erc20 + nft) to confirm the proposal
- ***quorumValidators*** - the percentage of total validator token supply to confirm the proposal
- ***minVotesForVoting*** - the minimal needed voting power to vote for the proposal
- ***minVotesForCreating*** - the minimal needed voting power to create the proposal
- ***rewardToken*** - the reward token address
- ***creationReward*** - the amount of reward for proposal creation
- ***executionReward*** - the amount of reward for proposal execution
- ***voteRewardsCoefficient*** - the reward multiplier for voting
- ***executorDescription*** - the settings description string

#

After creating a `GovPool` it is added to the `PoolRegistry`. From  `PoolRegistry` you can find out the list of all DAO pools on the **DeXe** platform. Use ***`listPools()`*** method to get this list.

```solidity
function listPools(
    string memory name,
    uint256 offset,
    uint256 limit
) public view returns (address[] memory pools)
```
- ***name*** - the associated pools name
- ***offset*** - the starting index in the pools array
- ***limit*** - the number of pools
- **returns** **->** pools the array of pools proxies