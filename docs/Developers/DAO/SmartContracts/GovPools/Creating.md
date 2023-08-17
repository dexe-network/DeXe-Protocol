# 🏗️ Creating

**DAO** Pool address is determined by its name and the address of the creator.

### Deploying with TokenSale proposal

Function ```deployGovPool()``` is used to deploy **DAO** Pool with *TokenSale* proposal (details on `Proposals`/`TokenSaleProposal`).

```solidity
function deployGovPool(
    GovPoolDeployParams calldata parameters
) external;
```

- ***parameters*** - the pool deploy parameters

```solidity
struct GovTokenSaleProposalDeployParams {
    ITokenSaleProposal.TierView[] tiersParams;
    ITokenSaleProposal.WhitelistingRequest[] whitelistParams;
    IERC20Sale.ConstructorParams tokenParams;
}
```

- ***tiersParams*** - tiers parameters
- ***whitelistParams*** - whitelisted users (for participation in tiers)
- ***tokenParams*** - parameters of the token

```solidity
struct GovPoolDeployParams {
    SettingsDeployParams settingsParams;
    ValidatorsDeployParams validatorsParams;
    UserKeeperDeployParams userKeeperParams;
    address nftMultiplierAddress;
    address verifier;
    bool onlyBABHolders;
    string descriptionURL;
    string name;
}
```

- ***settingsParams*** - general settings of the pool
- ***validatorsParams*** - parameters of validators
- ***userKeeperParams*** - parameters of the user keeper
- ***nftMultiplierAddress*** - the address of **NFT** multiplier
- ***verifier*** - the address of the verifier
- ***onlyBABHolders*** - the boolean flag
  - if *true* **->** only **BAB** holders can participate in the pool
- ***descriptionURL*** - the description of the pool
- ***name*** - the name of the pool

Structures in the parameters:

#

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
    uint64 executionDelay;
    RewardsInfo rewardsInfo;
    string executorDescription;
}
```

- ***earlyCompletion*** - the boolean flag
  - if *true* **->** the voting completes as soon as the quorum is reached
- ***delegatedVotingAllowed*** - the boolean flag
  - if *true* **->** delegators can vote with their own delegated tokens
  - if *false* **->** delegators can vote only with their own tokens and allowed to vote delegated and treasury tokens
- ***validatorsVote*** - the boolean flag
  - if *true* **->** voting will have an additional validators step
- ***duration*** - the duration of voting in seconds
- ***durationValidators*** - the duration of validators voting in seconds
- ***quorum*** - the percentage of total votes supply (**ERC20** + **NFT**) to confirm the proposal
- ***quorumValidators*** - the percentage of total validator token supply to confirm the proposal
- ***minVotesForVoting*** - the minimal needed voting power to vote for the proposal
- ***minVotesForCreating*** - the minimal needed voting power to create the proposal
- ***executionDelay*** - the delay before the proposal execution in seconds
- ***rewardsInfo*** - the rewards information
- ***executorDescription*** - the settings description string

`RewardsInfo` struct holds information about rewards for proposal type

```solidity
struct RewardsInfo {
    address rewardToken;
    uint256 creationReward;
    uint256 executionReward;
    uint256 voteForRewardsCoefficient;
    uint256 voteAgainstRewardsCoefficient;
}
```

- ***rewardToken*** - the address of the token used for rewards
- ***creationReward*** - the reward for creating the proposal
- ***executionReward*** - the reward for executing the proposal
- ***voteForRewardsCoefficient*** - the coefficient for calculating the reward for voting for the proposal
- ***voteAgainstRewardsCoefficient*** - the coefficient for calculating the reward for voting against the proposal

#

```solidity
struct ValidatorsDeployParams {
    string name;
    string symbol;
    IGovValidators.ProposalSettings proposalSettings;
    address[] validators;
    uint256[] balances;
}
```

- ***name*** - the name of a token used by validators
- ***symbol*** - the symbol of a token used by validators
- ***proposalSettings*** - the settings for validators proposals
- ***validators*** - list of the validator addresses
- ***balances*** - list of initial token balances of the validators

```solidity
struct ProposalSettings {
    uint64 duration;
    uint64 executionDelay;
    uint128 quorum;
}
```

- ***duration*** - the duration of voting in seconds
- ***executionDelay*** - the delay before the proposal execution in seconds
- ***quorum*** - the percentage of total votes supply (**ERC20** + **NFT**) to confirm the proposal

#

```solidity
struct UserKeeperDeployParams {
    address tokenAddress;
    address nftAddress;
    uint256 totalPowerInTokens;
    uint256 nftsTotalSupply;
}
```

- ***tokenAddress*** - address of the tokens used for voting
- ***nftAddress*** - address of the **NFT** used for voting
- ***totalPowerInTokens*** - the token equivalent of all **NFTs**
- ***nftsTotalSupply*** - the **NFT** collection size

#

After creating a `GovPool` it is added to the `PoolRegistry`. From  `PoolRegistry` you can find out the list of all DAO pools on the **DeXe** platform. Use ***`listPools()`*** method to get this list.

```solidity
function listPools(
    string memory name,
    uint256 offset,
    uint256 limit
) public view returns (address[] memory pools);
```

- ***name*** - the associated pools name
- ***offset*** - the starting index in the pools array
- ***limit*** - the number of pools
- **returns** **->**
  - **pools** - the array of pools proxies
