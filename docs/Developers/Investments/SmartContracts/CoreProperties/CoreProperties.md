# 🌌 CoreProperties

The purpose of this module is to store system constant parameters.
#### CoreParameters

 `CoreParameters` struct stores vital platform's parameters that may be modified by the **OWNER**.

 ```solidity
struct CoreParameters {
    uint128 govVotesLimit;
    uint128 govCommissionPercentage;
    uint256 tokenSaleProposalCommissionPercentage;
    uint128 micropoolVoteRewardsPercentage;
    uint128 treasuryVoteRewardsPercentage;
}
 ```

 
- ***govVotesLimit*** - the maximum number of simultaneous votes of the voter
- ***govCommission*** - the protocol's commission percentage
- ***tokenSaleProposalCommissionPercentage*** - the commission percentage for the token sale proposal
- ***micropoolVoteRewardsPercentage*** - the percentage of the reward for the micropool vote
- ***treasuryVoteRewardsPercentage*** - the percentage of the reward for the treasury vote
