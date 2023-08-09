// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * This contract is responsible for securely storing user's funds that are used during the voting. These are either
 * ERC20 tokens or NFTs
 */
interface IGovUserKeeper {
    /// @notice The struct holds information about user deposited tokens
    /// @param tokenBalance the amount of deposited tokens
    /// @param maxTokensLocked the upper bound of currently locked tokens
    /// @param lockedInProposals the amount of deposited tokens locked in proposals
    /// @param nftBalance the array of deposited nfts
    struct BalanceInfo {
        uint256 tokenBalance;
        EnumerableSet.UintSet nftBalance; // array of NFTs
    }

    /// @notice The struct holds information about user balances
    /// @param balanceInfo the BalanceInfo struct
    /// @param delegatedTokens the mapping of delegated tokens (delegatee address => delegated amount)
    /// @param delegatedNfts the mapping of delegated nfts (delegatee address => array of delegated nft ids)
    /// @param delegatees the array of delegatees
    struct UserInfo {
        BalanceInfo balanceInfo;
        mapping(address => uint256) delegatedTokens; // delegatee => amount
        mapping(address => EnumerableSet.UintSet) delegatedNfts; // delegatee => tokenIds
        EnumerableSet.AddressSet delegatees;
        uint256 maxTokensLocked;
        mapping(uint256 => uint256) lockedInProposals; // proposal id => locked amount
    }

    /// @notice The struct holds information about nft contract
    /// @param isSupportPower boolean flag, if true then nft contract supports power
    /// @param totalPowerInTokens the voting power of all nfts
    /// @param totalSupply the total supply of nfts that are not enumerable
    struct NFTInfo {
        bool isSupportPower;
        uint256 totalPowerInTokens;
        uint256 totalSupply;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param power the total vote power of a user
    /// @param nftPower the total nft power of a user
    /// @param perNftPower the power of every nft, bounded by index with nftIds
    /// @param ownedBalance the owned erc20 balance, decimals = 18
    /// @param ownedLength the amount of owned nfts
    /// @param nftIds the array of nft ids, bounded by index with perNftPower
    struct VotingPowerView {
        uint256 power;
        uint256 nftPower;
        uint256[] perNftPower;
        uint256 ownedBalance;
        uint256 ownedLength;
        uint256[] nftIds;
    }

    /// @notice The struct that is used in view functions of contract as a return argument
    /// @param delegatee the address of delegatee (person who gets delegation)
    /// @param delegatedTokens the amount of delegated tokens
    /// @param delegatedNfts the array of delegated nfts, bounded by index with perNftPower
    /// @param nftPower the total power of delegated nfts
    /// @param perNftPower the array of nft power, bounded by index with delegatedNfts
    struct DelegationInfoView {
        address delegatee;
        uint256 delegatedTokens;
        uint256[] delegatedNfts;
        uint256 nftPower;
        uint256[] perNftPower;
    }

    /// @notice The function for depositing tokens
    /// @param payer the address of depositor
    /// @param receiver the deposit receiver address
    /// @param amount the erc20 deposit amount
    function depositTokens(address payer, address receiver, uint256 amount) external;

    /// @notice The function for withdrawing tokens
    /// @param payer the address from whom to withdraw the tokens
    /// @param receiver the withdrawal receiver address
    /// @param amount the erc20 withdrawal amount
    function withdrawTokens(address payer, address receiver, uint256 amount) external;

    /// @notice The function for delegating tokens
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param amount the erc20 delegation amount
    function delegateTokens(address delegator, address delegatee, uint256 amount) external;

    /// @notice The function for undelegating tokens
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param amount the erc20 undelegation amount
    function undelegateTokens(address delegator, address delegatee, uint256 amount) external;

    /// @notice The function for depositing nfts
    /// @param payer the address of depositor
    /// @param receiver the deposit receiver address
    /// @param nftIds the array of deposited nft ids
    function depositNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    /// @notice The function for withdrawing nfts
    /// @param payer the address from whom to withdraw the nfts
    /// @param receiver the withdrawal receiver address
    /// @param nftIds the withdrawal nft ids
    function withdrawNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    /// @notice The function for delegating nfts
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param nftIds the array of delegated nft ids
    function delegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function for undelegating nfts
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param nftIds the array of undelegated nft ids
    function undelegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function for creation nft power snapshot
    /// @return `id` of power snapshot
    function createNftPowerSnapshot() external returns (uint256);

    /// @notice The function for recalculating max token locked amount of a user
    /// @param lockedProposals the array of proposal ids for recalculation
    /// @param voter the address of voter
    function updateMaxTokenLockedAmount(
        uint256[] calldata lockedProposals,
        address voter
    ) external;

    /// @notice The function for locking tokens in a proposal
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param amount the amount of tokens to lock
    function lockTokens(uint256 proposalId, address voter, uint256 amount) external;

    /// @notice The function for unlocking tokens in proposal
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    function unlockTokens(
        uint256 proposalId,
        address voter
    ) external returns (uint256 unlockedAmount);

    /// @notice The function for locking nfts
    /// @param voter the address of voter
    /// @param useDelegated the bool flag, if true then delegated nfts are locked
    /// @param nftIds the array of nft ids to lock
    function lockNfts(address voter, bool useDelegated, uint256[] calldata nftIds) external;

    /// @notice The function for unlocking nfts
    /// @param nftIds the array of nft ids to unlock
    function unlockNfts(uint256[] calldata nftIds) external;

    /// @notice The function for recalculating power of nfts
    /// @param nftIds the array of nft ids to recalculate the power for
    function updateNftPowers(uint256[] calldata nftIds) external;

    /// @notice The function for setting erc20 address
    /// @param _tokenAddress the erc20 address
    function setERC20Address(address _tokenAddress) external;

    /// @notice The function for setting erc721 address
    /// @param _nftAddress the erc721 address
    /// @param totalPowerInTokens the total voting power of nfts
    /// @param nftsTotalSupply the total supply of nft contract
    function setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) external;

    /// @notice The function for getting information about nft contract
    /// @return `NFTInfo` struct
    function getNftInfo() external view returns (NFTInfo memory);

    /// @notice The function for getting max locked amount of a user
    /// @param voter the address of voter
    /// @return `max locked amount`
    function maxLockedAmount(address voter) external view returns (uint256);

    /// @notice The function for getting token balance of a user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool balance
    /// @param useDelegated the boolean flag, if true then balance is calculated with delegations
    /// @return totalBalance the total balance with delegations
    /// @return ownedBalance the user balance that is not deposited to the contract
    function tokenBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 totalBalance, uint256 ownedBalance);

    /// @notice The function for getting nft balance of a user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool nft balance
    /// @param useDelegated the boolean flag, if true then balance is calculated with delegations
    /// @return totalBalance the total balance with delegations
    /// @return ownedBalance the number of nfts that are not deposited to the contract
    function nftBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 totalBalance, uint256 ownedBalance);

    /// @notice The function for getting nft ids of a user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool balance
    /// @param useDelegated the boolean flag, if true then balance is calculated with delegations
    /// @return nfts the array of owned nft ids
    /// @return ownedLength the number of nfts that are not deposited to the contract
    function nftExactBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256[] memory nfts, uint256 ownedLength);

    /// @notice The function for getting nft power from snapshot
    /// @param nftIds the array of nft ids to get the power of
    /// @param snapshotId the id of snapshot
    /// @return the power of nfts
    function getNftsPowerInTokensBySnapshot(
        uint256[] memory nftIds,
        uint256 snapshotId
    ) external view returns (uint256);

    /// @notice The function for getting total voting power of the contract
    /// @return `total` power
    function getTotalVoteWeight() external view returns (uint256);

    /// @notice The function to define if voter is able to create a proposal. Includes micropool balance
    /// @param voter the address of voter
    /// @param useDelegated the boolean flag, if true then balance is calculated with delegations
    /// @param requiredVotes the required voting power
    /// @param snapshotId the id of snapshot
    /// @return `true` - can participate, `false` - can't participate
    function canCreate(
        address voter,
        bool useDelegated,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view returns (bool);

    /// @notice The function to define if voter is able to vote. Includes wallet balance
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool balance
    /// @param useDelegated the boolean flag, if true then balance is calculated with delegations
    /// @param requiredVotes the required voting power
    /// @param snapshotId the id of snapshot
    /// @return `true` - can participate, `false` - can't participate
    function canVote(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view returns (bool);

    /// @notice The function for getting voting power of users
    /// @param users the array of users addresses
    /// @param isMicropools the array of boolean flags to use the micropool balances or not
    /// @param useDelegated the array of boolean flags to use the delegated tokens or not
    /// @return votingPowers the array of VotingPowerView structs
    function votingPower(
        address[] calldata users,
        bool[] calldata isMicropools,
        bool[] calldata useDelegated
    ) external view returns (VotingPowerView[] memory votingPowers);

    /// @notice The function for getting power of nfts by ids
    /// @param nftIds the array of nft ids
    /// @return nftPower the total power of nfts
    /// @return perNftPower the array of nft powers, bounded with nftIds by index
    function nftVotingPower(
        uint256[] memory nftIds
    ) external view returns (uint256 nftPower, uint256[] memory perNftPower);

    /// @notice The function for getting information about user's delegations
    /// @param user the address of user
    /// @return power the total delegated power
    /// @return delegationsInfo the array of DelegationInfoView structs
    function delegations(
        address user
    ) external view returns (uint256 power, DelegationInfoView[] memory delegationsInfo);

    /// @notice The function for getting information about funds that can be withdrawn
    /// @param voter the address of voter
    /// @param lockedProposals the array of ids of locked proposals
    /// @param unlockedNfts the array of unlocked nfts
    /// @return withdrawableTokens the tokens that can we withdrawn
    /// @return withdrawableNfts the array of nfts that can we withdrawn
    function getWithdrawableAssets(
        address voter,
        uint256[] calldata lockedProposals,
        uint256[] calldata unlockedNfts
    ) external view returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts);

    /// @notice The function for getting the total delegated amount by the delegator and the delegatee
    /// @param delegator the address of the delegator
    /// @param delegatee the address of the delegatee
    /// @return tokenAmount the amount of delegated tokens
    /// @return nftIds the list of delegated nft ids
    function getDelegatedAssets(
        address delegator,
        address delegatee
    ) external view returns (uint256 tokenAmount, uint256[] memory nftIds);
}
