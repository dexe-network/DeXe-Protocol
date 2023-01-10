# 🌟 Creating

`RiskyProposal` can be created on `BasicTraderPool`. A proposal is a sub-pool of the main pool, which has its own **LP** tokens and shares of investors' funds. The proposal can be created with some investment restrictions, but funds can be withdrawn from it at any time. At the time of creation and investment in the proposal, the funds of the main pool are used. You can get into the proposal only if you are an investor in the main pool.

The proposals follow pretty much the same rules as the main pool except that the trade can happen with a specified token only.

Investors can't fund the proposal more than the trader percentage-wise.

Function ***`createProposal()`*** on the `BasicTraderPool` is used to create a risky proposal.

```solidity
function createProposal(
    address token,
    uint256 lpAmount,
    ITraderPoolRiskyProposal.ProposalLimits calldata proposalLimits,
    uint256 instantTradePercentage,
    uint256[] calldata minDivestOut,
    uint256 minProposalOut,
    address[] calldata optionalPath
) external;
```
- ***token*** - the token the proposal will be opened to
- ***lpAmount*** - the amount of **LP** tokens the trader would like to invest into the proposal at its creation
- ***proposalLimits*** - the certain limits this proposal will have
- ***instantTradePercentage*** - the percentage of **LP** tokens (base tokens under them) that will be instantly traded to the proposal token
- ***minDivestOut*** - is an array of main pool position amounts that will be closed upon the proposal creation
- ***minProposalOut*** - is a minimal received amount of proposal position token upon the proposal creation
- ***optionalPath*** - is an optional path between the base token and proposal token that will be used by the on-chain pathfinder

#### Fetching parameters

To fetch ***minDivestOut*** parameters the function ***`getDivestAmountsAndCommissions()`*** is used. The user won't pay the commission, if they decide to invest in the risky proposal.

```solidity
function getDivestAmountsAndCommissions(
    address user,
    uint256 amountLP
) external returns (Receptions memory receptions, Commissions memory commissions);
```
- ***user*** -  the address of the user who is going to invest in the risky proposal
- ***amountLP*** - the amount of **LP** tokens the user is willing to invest
- **returns** **->**
    - ***receptions***  - the tokens that the user will receive
    - ***commissions*** - can be ignored

To fetch ***minProposalOut*** parameters the function ***`getCreationTokens()`*** is used.

```solidity
function getCreationTokens(
    address token,
    uint256 baseInvestment,
    uint256 instantTradePercentage,
    address[] calldata optionalPath
) external returns (
    uint256 positionTokens, 
    uint256 positionTokenPrice, 
    address[] memory path
);
```
- ***token*** - the address of the proposal token
- ***baseInvestment*** - the amount of base tokens invested right away
- ***instantTradePercentage*** - the percentage of tokens that will be traded instantly to a token
- ***optionalPath*** - the path between the base token and the position token that will be used by the on-chain pathfinder
- **returns** **->** 
    - ***positionTokens*** - the amount of position tokens received upon creation
    - ***positionTokenPrice*** - the price of a proposal token in the base tokens
    - ***path*** - the path between the tokens that will be used in the swap

When a proposal is created, a trader partially closes positions in the main pool and opens a proposal position.

Function ***`getDivestAmountsAndCommissions()`*** on `TraderPool` is used to receive the number of tokens when closing positions.

Function ***`proposalPoolAddress()`*** on `BasicTraderPool` is used to get the address of the proposal pool.

```solidity
function proposalPoolAddress() external returns (address);
```
