# 🏗️ Creating

**DAO** Pool address is determined by its name and the address of the creator.

**DAO** Pool is deployed via ***`deployGovPool()`*** function on `PoolFactory`.

```solidity
function deployGovPool(GovPoolDeployParams calldata parameters) external;
```

- ***parameters*** - the pool deploy parameters

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
    address rewardToken;
    uint256 creationReward;
    uint256 executionRewardFor;
    uint256 executionRewardAgainst;
    uint256 voteRewardsCoefficient;
    string executorDescription;
}
```

- ***earlyCompletion*** - the boolean flag
  - if *true* **->** the voting completes as soon as the quorum is reached
- ***delegatedVotingAllowed*** - the boolean flag
  - if *true* **->** delegators can vote with their own delegated tokens
- ***validatorsVote*** - the boolean flag
  - if *true* **->** voting will have an additional validators step
- ***duration*** - the duration of voting in seconds
- ***durationValidators*** - the duration of validators voting in seconds
- ***quorum*** - the percentage of total votes supply (**ERC20** + **NFT**) to confirm the proposal
- ***quorumValidators*** - the percentage of total validator token supply to confirm the proposal
- ***minVotesForVoting*** - the minimal needed voting power to vote for the proposal
- ***minVotesForCreating*** - the minimal needed voting power to create the proposal
- ***rewardToken*** - the reward token address
- ***creationReward*** - the amount of reward for proposal creation
- ***executionReward*** - the amount of reward for proposal execution if the proposal is accepted
- ***executionRewardAgainst*** - the amount of reward for proposal execution if the proposal is rejected
- ***voteRewardsCoefficient*** - the reward multiplier for voting
- ***executorDescription*** - the settings description string

#

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

- ***name*** - the name of a token used by validators
- ***symbol*** - the symbol of a token used by validators
- ***duration*** - the duration of voting (without the participation of the **DAO** pool) of validators in seconds
- ***quorum*** - percentage of tokens from the token supply needed to reach a quorum
- ***validators*** - list of the validator addresses
- ***balances*** - list of initial token balances of the validators

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

### Deploying with TokenSale proposal

Function ```deployGovPoolWithTokenSale()``` is used to deploy **DAO** Pool with *TokenSale* proposal (details on `Proposals`/`TokenSaleProposal`).

```solidity
function deployGovPoolWithTokenSale(
    GovPoolDeployParams calldata parameters,
    GovTokenSaleProposalDeployParams calldata tokenSaleParams
) external;
```

- ***parameters*** - the pool deploy parameters
- ***tokenSaleParams*** - the **TokenSale** proposal parameters

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
