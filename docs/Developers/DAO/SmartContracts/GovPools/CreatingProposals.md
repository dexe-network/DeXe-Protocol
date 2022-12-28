# 💡 Creating proposal

*Proposal* - intention of the pool **DAO** to do something. After its creation, users will have to vote for its adoption according to the rules specified in the voting settings (duration, quorum, validators...).

#
Function ***`createProposal()`*** on `GovPool` is used to create proposals.
```solidity
function createProposal(
    string calldata descriptionURL,
    string calldata misc,
    address[] memory executors,
    uint256[] calldata values,
    bytes[] calldata data
) external;
```
- ***descriptionURL*** - *IPFS* URL to the proposal's description
- ***executors*** - Executors addresses
- ***values*** - the ether values ??
- ***data*** - data Bytes

#

There are different types of proposals:
- Changing pool's internal settings (***internal***)
- Changing validators (***validators***)
- Creating a `DistributionProposal` (***distribution***)
- Executing special offers (***special***)

Each of them executes it`s own set of validation  `executors`, `values` and `data` parameters.

#### ***internal*** :

***`addSettings()`***

***`editSettings()`***

 ***`changeExecutors()`***
 
 ***`setERC20Address()`***
 
 ***`setERC721Address()`***
 
 ***`editDescriptionURL()`***
 
 ***`setNftMultiplierAddress()`***

 #### ***validators*** :

 ***`changeBalances()`***

 #### ***distribution*** :

 ***`approve()`***
 
 ***`transfer()`***

#### 

