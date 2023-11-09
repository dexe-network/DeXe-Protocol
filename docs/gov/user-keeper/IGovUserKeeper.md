# IGovUserKeeper

## Interface Description


License: MIT

## 

```solidity
interface IGovUserKeeper
```

This contract is responsible for securely storing user's funds that are used during the voting. These are either
ERC20 tokens or NFTs
## Structs info

### BalanceInfo

```solidity
struct BalanceInfo {
	uint256 tokens;
	EnumerableSet.UintSet nfts;
}
```

The struct holds information about user deposited tokens


Parameters:

| Name   | Type                         | Description                     |
| :----- | :--------------------------- | :------------------------------ |
| tokens | uint256                      | the amount of deposited tokens  |
| nfts   | struct EnumerableSet.UintSet | the array of deposited nfts     |

### UserInfo

```solidity
struct UserInfo {
	mapping(IGovPool.VoteType => struct IGovUserKeeper.BalanceInfo) balances;
	mapping(IGovPool.VoteType => uint256) nftsPowers;
	mapping(address => IGovUserKeeper.BalanceInfo) delegatedBalances;
	mapping(address => uint256) delegatedNftPowers;
	IGovUserKeeper.BalanceInfo allDelegatedBalance;
	EnumerableSet.AddressSet delegatees;
	uint256 maxTokensLocked;
	mapping(uint256 => uint256) lockedInProposals;
}
```

The struct holds information about user balances


Parameters:

| Name                | Type                                                                 | Description                                        |
| :------------------ | :------------------------------------------------------------------- | :------------------------------------------------- |
| balances            | mapping(enum IGovPool.VoteType => struct IGovUserKeeper.BalanceInfo) | matching vote types with balance infos             |
| nftsPowers          | mapping(enum IGovPool.VoteType => uint256)                           | matching vote types with cached nfts powers        |
| delegatedBalances   | mapping(address => struct IGovUserKeeper.BalanceInfo)                | matching delegatees with balances infos            |
| delegatedNftPowers  | mapping(address => uint256)                                          | matching delegatees with delegated nft powers      |
| allDelegatedBalance | struct IGovUserKeeper.BalanceInfo                                    | the balance info of all delegated assets           |
| delegatees          | struct EnumerableSet.AddressSet                                      | the array of delegatees                            |
| maxTokensLocked     | uint256                                                              | the upper bound of currently locked tokens         |
| lockedInProposals   | mapping(uint256 => uint256)                                          | the amount of deposited tokens locked in proposals |

### NFTInfo

```solidity
struct NFTInfo {
	address nftAddress;
	bool isSupportPower;
	uint256 individualPower;
	uint256 totalSupply;
	mapping(uint256 => uint256) nftMinPower;
}
```

The struct holds information about nft contract


Parameters:

| Name            | Type                        | Description                                             |
| :-------------- | :-------------------------- | :------------------------------------------------------ |
| nftAddress      | address                     | the address of the nft                                  |
| isSupportPower  | bool                        | boolean flag, if true then nft contract supports power  |
| individualPower | uint256                     | the voting power an nft                                 |
| totalSupply     | uint256                     | the total supply of nfts that are not enumerable        |
| nftMinPower     | mapping(uint256 => uint256) | matching nft ids to their minimal powers                |

### VotingPowerView

```solidity
struct VotingPowerView {
	uint256 power;
	uint256 rawPower;
	uint256 nftPower;
	uint256 rawNftPower;
	uint256[] perNftPower;
	uint256 ownedBalance;
	uint256 ownedLength;
	uint256[] nftIds;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name         | Type      | Description                                             |
| :----------- | :-------- | :------------------------------------------------------ |
| power        | uint256   | the total vote power of a user                          |
| rawPower     | uint256   | the total deposited assets power of a user              |
| nftPower     | uint256   | the total nft power of a user                           |
| rawNftPower  | uint256   | the total deposited nft power of a user                 |
| perNftPower  | uint256[] | the power of every nft, bounded by index with nftIds    |
| ownedBalance | uint256   | the owned erc20 balance, decimals = 18                  |
| ownedLength  | uint256   | the amount of owned nfts                                |
| nftIds       | uint256[] | the array of nft ids, bounded by index with perNftPower |

### DelegationInfoView

```solidity
struct DelegationInfoView {
	address delegatee;
	uint256 delegatedTokens;
	uint256[] delegatedNfts;
	uint256 nftPower;
	uint256[] perNftPower;
}
```

The struct that is used in view functions of contract as a return argument


Parameters:

| Name            | Type      | Description                                                     |
| :-------------- | :-------- | :-------------------------------------------------------------- |
| delegatee       | address   | the address of delegatee (person who gets delegation)           |
| delegatedTokens | uint256   | the amount of delegated tokens                                  |
| delegatedNfts   | uint256[] | the array of delegated nfts, bounded by index with perNftPower  |
| nftPower        | uint256   | the total power of delegated nfts                               |
| perNftPower     | uint256[] | the array of nft power, bounded by index with delegatedNfts     |

## Functions info

### depositTokens (0x39dc5ef2)

```solidity
function depositTokens(
    address payer,
    address receiver,
    uint256 amount
) external
```

The function for depositing tokens


Parameters:

| Name     | Type    | Description                   |
| :------- | :------ | :---------------------------- |
| payer    | address | the address of depositor      |
| receiver | address | the deposit receiver address  |
| amount   | uint256 | the erc20 deposit amount      |

### withdrawTokens (0x5e35359e)

```solidity
function withdrawTokens(
    address payer,
    address receiver,
    uint256 amount
) external
```

The function for withdrawing tokens


Parameters:

| Name     | Type    | Description                                   |
| :------- | :------ | :-------------------------------------------- |
| payer    | address | the address from whom to withdraw the tokens  |
| receiver | address | the withdrawal receiver address               |
| amount   | uint256 | the erc20 withdrawal amount                   |

### delegateTokens (0x9161babb)

```solidity
function delegateTokens(
    address delegator,
    address delegatee,
    uint256 amount
) external
```

The function for delegating tokens


Parameters:

| Name      | Type    | Description                 |
| :-------- | :------ | :-------------------------- |
| delegator | address | the address of delegator    |
| delegatee | address | the address of delegatee    |
| amount    | uint256 | the erc20 delegation amount |

### delegateTokensTreasury (0x69b5330b)

```solidity
function delegateTokensTreasury(address delegatee, uint256 amount) external
```

The function for delegating tokens from Treasury


Parameters:

| Name      | Type    | Description                 |
| :-------- | :------ | :-------------------------- |
| delegatee | address | the address of delegatee    |
| amount    | uint256 | the erc20 delegation amount |

### undelegateTokens (0x0ae1398e)

```solidity
function undelegateTokens(
    address delegator,
    address delegatee,
    uint256 amount
) external
```

The function for undelegating tokens


Parameters:

| Name      | Type    | Description                   |
| :-------- | :------ | :---------------------------- |
| delegator | address | the address of delegator      |
| delegatee | address | the address of delegatee      |
| amount    | uint256 | the erc20 undelegation amount |

### undelegateTokensTreasury (0x86be8d2d)

```solidity
function undelegateTokensTreasury(address delegatee, uint256 amount) external
```

The function for undelegating tokens from Treasury


Parameters:

| Name      | Type    | Description                   |
| :-------- | :------ | :---------------------------- |
| delegatee | address | the address of delegatee      |
| amount    | uint256 | the erc20 undelegation amount |

### depositNfts (0x9693caad)

```solidity
function depositNfts(
    address payer,
    address receiver,
    uint256[] calldata nftIds
) external
```

The function for depositing nfts


Parameters:

| Name     | Type      | Description                    |
| :------- | :-------- | :----------------------------- |
| payer    | address   | the address of depositor       |
| receiver | address   | the deposit receiver address   |
| nftIds   | uint256[] | the array of deposited nft ids |

### withdrawNfts (0x1f96f376)

```solidity
function withdrawNfts(
    address payer,
    address receiver,
    uint256[] calldata nftIds
) external
```

The function for withdrawing nfts


Parameters:

| Name     | Type      | Description                                 |
| :------- | :-------- | :------------------------------------------ |
| payer    | address   | the address from whom to withdraw the nfts  |
| receiver | address   | the withdrawal receiver address             |
| nftIds   | uint256[] | the withdrawal nft ids                      |

### delegateNfts (0xbfb1a57d)

```solidity
function delegateNfts(
    address delegator,
    address delegatee,
    uint256[] calldata nftIds
) external
```

The function for delegating nfts


Parameters:

| Name      | Type      | Description                    |
| :-------- | :-------- | :----------------------------- |
| delegator | address   | the address of delegator       |
| delegatee | address   | the address of delegatee       |
| nftIds    | uint256[] | the array of delegated nft ids |

### delegateNftsTreasury (0x6ad6d3c1)

```solidity
function delegateNftsTreasury(
    address delegatee,
    uint256[] calldata nftIds
) external
```

The function for delegating nfts from Treasury


Parameters:

| Name      | Type      | Description                    |
| :-------- | :-------- | :----------------------------- |
| delegatee | address   | the address of delegatee       |
| nftIds    | uint256[] | the array of delegated nft ids |

### undelegateNfts (0x37267d4c)

```solidity
function undelegateNfts(
    address delegator,
    address delegatee,
    uint256[] calldata nftIds
) external
```

The function for undelegating nfts


Parameters:

| Name      | Type      | Description                      |
| :-------- | :-------- | :------------------------------- |
| delegator | address   | the address of delegator         |
| delegatee | address   | the address of delegatee         |
| nftIds    | uint256[] | the array of undelegated nft ids |

### undelegateNftsTreasury (0x39be038b)

```solidity
function undelegateNftsTreasury(
    address delegatee,
    uint256[] calldata nftIds
) external
```

The function for undelegating nfts from Treasury


Parameters:

| Name      | Type      | Description                      |
| :-------- | :-------- | :------------------------------- |
| delegatee | address   | the address of delegatee         |
| nftIds    | uint256[] | the array of undelegated nft ids |

### updateMaxTokenLockedAmount (0x5f884296)

```solidity
function updateMaxTokenLockedAmount(
    uint256[] calldata lockedProposals,
    address voter
) external
```

The function for recalculating max token locked amount of a user


Parameters:

| Name            | Type      | Description                                  |
| :-------------- | :-------- | :------------------------------------------- |
| lockedProposals | uint256[] | the array of proposal ids for recalculation  |
| voter           | address   | the address of voter                         |

### lockTokens (0x154b3db0)

```solidity
function lockTokens(uint256 proposalId, address voter, uint256 amount) external
```

The function for locking tokens in a proposal


Parameters:

| Name       | Type    | Description                  |
| :--------- | :------ | :--------------------------- |
| proposalId | uint256 | the id of proposal           |
| voter      | address | the address of voter         |
| amount     | uint256 | the amount of tokens to lock |

### unlockTokens (0x7fde4424)

```solidity
function unlockTokens(uint256 proposalId, address voter) external
```

The function for unlocking tokens in proposal


Parameters:

| Name       | Type    | Description          |
| :--------- | :------ | :------------------- |
| proposalId | uint256 | the id of proposal   |
| voter      | address | the address of voter |

### lockNfts (0x3b389164)

```solidity
function lockNfts(
    address voter,
    IGovPool.VoteType voteType,
    uint256[] calldata nftIds
) external
```

The function for locking nfts


Parameters:

| Name     | Type                   | Description                  |
| :------- | :--------------------- | :--------------------------- |
| voter    | address                | the address of voter         |
| voteType | enum IGovPool.VoteType | the type of vote             |
| nftIds   | uint256[]              | the array of nft ids to lock |

### unlockNfts (0x7be49fe3)

```solidity
function unlockNfts(uint256[] calldata nftIds) external
```

The function for unlocking nfts


Parameters:

| Name   | Type      | Description                    |
| :----- | :-------- | :----------------------------- |
| nftIds | uint256[] | the array of nft ids to unlock |

### updateNftPowers (0x30132f5e)

```solidity
function updateNftPowers(uint256[] calldata nftIds) external
```

The function for recalculating power of nfts


Parameters:

| Name   | Type      | Description                                       |
| :----- | :-------- | :------------------------------------------------ |
| nftIds | uint256[] | the array of nft ids to recalculate the power for |

### setERC20Address (0x41bec0d2)

```solidity
function setERC20Address(address _tokenAddress) external
```

The function for setting erc20 address


Parameters:

| Name          | Type    | Description       |
| :------------ | :------ | :---------------- |
| _tokenAddress | address | the erc20 address |

### setERC721Address (0x37e5e863)

```solidity
function setERC721Address(
    address _nftAddress,
    uint256 individualPower,
    uint256 nftsTotalSupply
) external
```

The function for setting erc721 address


Parameters:

| Name            | Type    | Description                      |
| :-------------- | :------ | :------------------------------- |
| _nftAddress     | address | the erc721 address               |
| individualPower | uint256 | the voting power of an nft       |
| nftsTotalSupply | uint256 | the total supply of nft contract |

### tokenAddress (0x9d76ea58)

```solidity
function tokenAddress() external view returns (address)
```

The function for getting erc20 address


Return values:

| Name | Type    | Description                      |
| :--- | :------ | :------------------------------- |
| [0]  | address | `tokenAddress` the erc20 address |

### nftAddress (0x5bf8633a)

```solidity
function nftAddress() external view returns (address)
```

The function for getting erc721 address


Return values:

| Name | Type    | Description                     |
| :--- | :------ | :------------------------------ |
| [0]  | address | `nftAddress` the erc721 address |

### getNftInfo (0x7ca5685f)

```solidity
function getNftInfo()
    external
    view
    returns (bool isSupportPower, uint256 individualPower, uint256 totalSupply)
```

The function for getting nft info


Return values:

| Name            | Type    | Description                                             |
| :-------------- | :------ | :------------------------------------------------------ |
| isSupportPower  | bool    | boolean flag, if true then nft contract supports power  |
| individualPower | uint256 | the voting power an nft                                 |
| totalSupply     | uint256 | the total supply of nfts that are not enumerable        |

### maxLockedAmount (0x3b3707a3)

```solidity
function maxLockedAmount(address voter) external view returns (uint256)
```

The function for getting max locked amount of a user


Parameters:

| Name  | Type    | Description           |
| :---- | :------ | :-------------------- |
| voter | address | the address of voter  |


Return values:

| Name | Type    | Description         |
| :--- | :------ | :------------------ |
| [0]  | uint256 | `max locked amount` |

### tokenBalance (0xe94e3c67)

```solidity
function tokenBalance(
    address voter,
    IGovPool.VoteType voteType
) external view returns (uint256 balance, uint256 ownedBalance)
```

The function for getting token balance of a user


Parameters:

| Name     | Type                   | Description           |
| :------- | :--------------------- | :-------------------- |
| voter    | address                | the address of voter  |
| voteType | enum IGovPool.VoteType | the type of vote      |


Return values:

| Name         | Type    | Description                                            |
| :----------- | :------ | :----------------------------------------------------- |
| balance      | uint256 | the total balance with delegations                     |
| ownedBalance | uint256 | the user balance that is not deposited to the contract |

### nftBalance (0x26836340)

```solidity
function nftBalance(
    address voter,
    IGovPool.VoteType voteType
) external view returns (uint256 balance, uint256 ownedBalance)
```

The function for getting nft balance of a user


Parameters:

| Name     | Type                   | Description           |
| :------- | :--------------------- | :-------------------- |
| voter    | address                | the address of voter  |
| voteType | enum IGovPool.VoteType | the type of vote      |


Return values:

| Name         | Type    | Description                                               |
| :----------- | :------ | :-------------------------------------------------------- |
| balance      | uint256 | the total balance with delegations                        |
| ownedBalance | uint256 | the number of nfts that are not deposited to the contract |

### nftExactBalance (0x3bea071d)

```solidity
function nftExactBalance(
    address voter,
    IGovPool.VoteType voteType
) external view returns (uint256[] memory nfts, uint256 ownedLength)
```

The function for getting nft ids of a user


Parameters:

| Name     | Type                   | Description           |
| :------- | :--------------------- | :-------------------- |
| voter    | address                | the address of voter  |
| voteType | enum IGovPool.VoteType | the type of vote      |


Return values:

| Name        | Type      | Description                                               |
| :---------- | :-------- | :-------------------------------------------------------- |
| nfts        | uint256[] | the array of owned nft ids                                |
| ownedLength | uint256   | the number of nfts that are not deposited to the contract |

### getTotalNftsPower (0x4a5f293c)

```solidity
function getTotalNftsPower(
    uint256[] memory nftIds,
    IGovPool.VoteType voteType,
    address voter,
    bool perNftPowerArray
) external view returns (uint256 nftPower, uint256[] memory perNftPower)
```

The function for getting total power of nfts by ids


Parameters:

| Name             | Type                   | Description                                  |
| :--------------- | :--------------------- | :------------------------------------------- |
| nftIds           | uint256[]              | the array of nft ids                         |
| voteType         | enum IGovPool.VoteType | the type of vote                             |
| voter            | address                | the address of user                          |
| perNftPowerArray | bool                   | should the nft raw powers array be returned  |


Return values:

| Name        | Type      | Description                                           |
| :---------- | :-------- | :---------------------------------------------------- |
| nftPower    | uint256   | the total total power of nfts                         |
| perNftPower | uint256[] | the array of nft powers, bounded with nftIds by index |

### getTotalPower (0x53976a26)

```solidity
function getTotalPower() external view returns (uint256 power)
```

The function for getting total voting power of the contract


Return values:

| Name  | Type    | Description |
| :---- | :------ | :---------- |
| power | uint256 | total power |

### canCreate (0x6f123e76)

```solidity
function canCreate(
    address voter,
    IGovPool.VoteType voteType,
    uint256 requiredVotes
) external view returns (bool)
```

The function to define if voter is able to create a proposal. Includes micropool balance


Parameters:

| Name          | Type                   | Description                |
| :------------ | :--------------------- | :------------------------- |
| voter         | address                | the address of voter       |
| voteType      | enum IGovPool.VoteType | the type of vote           |
| requiredVotes | uint256                | the required voting power  |


Return values:

| Name | Type | Description                                           |
| :--- | :--- | :---------------------------------------------------- |
| [0]  | bool | `true` - can participate, `false` - can't participate |

### votingPower (0xae987229)

```solidity
function votingPower(
    address[] calldata users,
    IGovPool.VoteType[] calldata voteTypes,
    bool perNftPowerArray
) external view returns (IGovUserKeeper.VotingPowerView[] memory votingPowers)
```

The function for getting voting power of users


Parameters:

| Name             | Type                     | Description                                |
| :--------------- | :----------------------- | :----------------------------------------- |
| users            | address[]                | the array of users addresses               |
| voteTypes        | enum IGovPool.VoteType[] | the array of vote types                    |
| perNftPowerArray | bool                     | should the nft powers array be calculated  |


Return values:

| Name         | Type                                    | Description                          |
| :----------- | :-------------------------------------- | :----------------------------------- |
| votingPowers | struct IGovUserKeeper.VotingPowerView[] | the array of VotingPowerView structs |

### transformedVotingPower (0x375b592e)

```solidity
function transformedVotingPower(
    address voter,
    uint256 amount,
    uint256[] calldata nftIds
) external view returns (uint256 personalPower, uint256 fullPower)
```

The function for getting voting power after the formula


Parameters:

| Name   | Type      | Description               |
| :----- | :-------- | :------------------------ |
| voter  | address   | the address of the voter  |
| amount | uint256   | the amount of tokens      |
| nftIds | uint256[] | the array of nft ids      |


Return values:

| Name          | Type    | Description                                                |
| :------------ | :------ | :--------------------------------------------------------- |
| personalPower | uint256 | the personal voting power after the formula                |
| fullPower     | uint256 | the personal plus delegated voting power after the formula |

### delegations (0x4d123d7e)

```solidity
function delegations(
    address user,
    bool perNftPowerArray
)
    external
    view
    returns (
        uint256 power,
        IGovUserKeeper.DelegationInfoView[] memory delegationsInfo
    )
```

The function for getting information about user's delegations


Parameters:

| Name             | Type    | Description                                |
| :--------------- | :------ | :----------------------------------------- |
| user             | address | the address of user                        |
| perNftPowerArray | bool    | should the nft powers array be calculated  |


Return values:

| Name            | Type                                       | Description                             |
| :-------------- | :----------------------------------------- | :-------------------------------------- |
| power           | uint256                                    | the total delegated power               |
| delegationsInfo | struct IGovUserKeeper.DelegationInfoView[] | the array of DelegationInfoView structs |

### getWithdrawableAssets (0x221c0fd6)

```solidity
function getWithdrawableAssets(
    address voter,
    uint256[] calldata lockedProposals,
    uint256[] calldata unlockedNfts
)
    external
    view
    returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts)
```

The function for getting information about funds that can be withdrawn


Parameters:

| Name            | Type      | Description                           |
| :-------------- | :-------- | :------------------------------------ |
| voter           | address   | the address of voter                  |
| lockedProposals | uint256[] | the array of ids of locked proposals  |
| unlockedNfts    | uint256[] | the array of unlocked nfts            |


Return values:

| Name               | Type      | Description                             |
| :----------------- | :-------- | :-------------------------------------- |
| withdrawableTokens | uint256   | the tokens that can we withdrawn        |
| withdrawableNfts   | uint256[] | the array of nfts that can we withdrawn |

### getDelegatedAssetsPower (0x8a3ca923)

```solidity
function getDelegatedAssetsPower(
    address delegator,
    address delegatee
) external view returns (uint256 delegatedPower)
```

The function for getting the total delegated power by the delegator and the delegatee


Parameters:

| Name      | Type    | Description                   |
| :-------- | :------ | :---------------------------- |
| delegator | address | the address of the delegator  |
| delegatee | address | the address of the delegatee  |


Return values:

| Name           | Type    | Description               |
| :------------- | :------ | :------------------------ |
| delegatedPower | uint256 | the total delegated power |
