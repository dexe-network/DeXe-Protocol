// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../../libs/data-structures/ShrinkableArray.sol";

/**
 * This contract is responsible for securely storing user's funds that are used during the voting. These are either
 * ERC20 tokens or NFTs
 */
interface IGovUserKeeper {
    /// @notice The struct holds information about token balance and locked in proposals
    /// @param tokenBalance the amount of deposited tokens
    /// @param maxTokensLocked the upper border of deposits for all time
    /// @param lockedInProposals the amount of deposited tokens locked in proposals
    /// @param nftBalance the array of locked nfts
    struct BalanceInfo {
        uint256 tokenBalance;
        uint256 maxTokensLocked;
        mapping(uint256 => uint256) lockedInProposals; // proposal id => locked amount
        EnumerableSet.UintSet nftBalance; // array of NFTs
    }

    /// @notice The struct holds information about user balances flows
    /// @param balanceInfo the BalanceInfo struct
    /// @param delegatedTokens the mapping of delegated tokens (delegatee address => delegated amount)
    /// @param delegatedNfts the mapping of delegated nfts (delegatee address => array of delegated nft ids)
    struct UserInfo {
        BalanceInfo balanceInfo;
        mapping(address => uint256) delegatedTokens; // delegatee => amount
        mapping(address => EnumerableSet.UintSet) delegatedNfts; // delegatee => tokenIds
        EnumerableSet.AddressSet delegatees;
    }

    /// @notice The struct holds information about nft contract
    /// @param isSupportPower boolean flag, if true then nft contract supports power
    /// @param totalPowerInTokens the total power of all nfts of contract
    /// @param totalSupply the total supply of nft contract
    struct NFTInfo {
        bool isSupportPower;
        uint256 totalPowerInTokens;
        uint256 totalSupply;
    }

    /// @notice The struct that used in view functs of contract as a returns arg
    /// @param power the total vote power of user
    /// @param nftPower the total nft power of user
    /// @param perNftPower the power of every nft, bounded by index with nftIds
    /// @param ownedBalance the balance of erc20, decimals = 18
    /// @param ownedLength the count of voter nfts
    /// @param nftIds the array of nft ids, bounded by index with perNftPower
    struct VotingPowerView {
        uint256 power;
        uint256 nftPower;
        uint256[] perNftPower;
        uint256 ownedBalance;
        uint256 ownedLength;
        uint256[] nftIds;
    }

    /// @notice The struct that used in view functs of contract as a returns arg
    /// @param delegatee the address of delegatee (person who gets delegation)
    /// @param delegatedTokens the amount of delegated tokens
    /// @param delegatedNfts the array of delegated nfts, bounded by index with perNftPower
    /// @param nftPower the total power of all nfts
    /// @param perNftPower the array of nft power, bounded by index with delegatedNfts
    struct DelegationInfoView {
        address delegatee;
        uint256 delegatedTokens;
        uint256[] delegatedNfts;
        uint256 nftPower;
        uint256[] perNftPower;
    }

    /// @notice The fucntion for depositin tokens
    /// @param payer the address of depositor
    /// @param receiver the address of receiver of deposit
    /// @param amount the amount of deposit
    function depositTokens(address payer, address receiver, uint256 amount) external;

    /// @notice The fucntion for withdrawing tokens
    /// @param payer the address of source of tokens
    /// @param receiver the address of receiver of withdrawing
    /// @param amount the amount of withdraw
    function withdrawTokens(address payer, address receiver, uint256 amount) external;

    /// @notice The fucntion for delegating tokens
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param amount the amount of delegation
    function delegateTokens(address delegator, address delegatee, uint256 amount) external;

    /// @notice The fucntion for undelegating tokens
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param amount the amount of undelegation
    function undelegateTokens(address delegator, address delegatee, uint256 amount) external;

    /// @notice The fucntion for depositin nfts
    /// @param payer the address of depositor
    /// @param receiver the address of receiver of deposit
    /// @param nftIds the array of nft ids
    function depositNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    /// @notice The fucntion for withdrawing nfts
    /// @param payer the address of depositor
    /// @param receiver the address of receiver of withdraw
    /// @param nftIds the array of nft ids
    function withdrawNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    /// @notice The fucntion for delegating nfts
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param nftIds the array of nft ids
    function delegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    /// @notice The fucntion for undelegating nfts
    /// @param delegator the address of delegator
    /// @param delegatee the address of delegatee
    /// @param nftIds the array of nft ids
    function undelegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function for creation power snapshot
    /// @return `id` of power snapshot
    function createNftPowerSnapshot() external returns (uint256);

    /// @notice The function for recalculation of max token locked token amount
    /// @param lockedProposals the array of proposal ids for recalculation
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then recalculation uses for micropool
    function updateMaxTokenLockedAmount(
        uint256[] calldata lockedProposals,
        address voter,
        bool isMicropool
    ) external;

    /// @notice The function for locking tokens in proposal
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param amount the amount of tokens for locking
    function lockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool,
        uint256 amount
    ) external;

    /// @notice The function for unlocking tokens in proposal
    /// @param proposalId the id of proposal
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    function unlockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external returns (uint256 unlockedAmount);

    /// @notice The function for locking nfts
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param nftIds the array of nft ids
    function lockNfts(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256[] calldata nftIds
    ) external;

    /// @notice The function for unlocking nfts
    /// @param nftIds the array of nft ids
    function unlockNfts(uint256[] calldata nftIds) external;

    /// @notice The function for recalculation power of nfts
    /// @param nftIds the array of nft ids
    function updateNftPowers(uint256[] calldata nftIds) external;

    /// @notice The function for setting erc20 address
    /// @param _tokenAddress the erc20 address
    function setERC20Address(address _tokenAddress) external;

    /// @notice The function for setting erc721 address
    /// @param _nftAddress the erc721 address
    /// @param totalPowerInTokens the total power of nft contract
    /// @param nftsTotalSupply the total supply of nft contract
    function setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) external;

    /// @notice The function for getting information about nft contract
    /// @return `NFTInfo` struct
    function getNftInfo() external view returns (NFTInfo memory);

    /// @notice The function for getting max locked amount for one user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @return `max locked amount`
    function maxLockedAmount(address voter, bool isMicropool) external view returns (uint256);

    /// @notice The function for getting token balance of one user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param useDelegated the boolean flag, if true then balance calculates with delegations
    /// @return balance the balance with delegations
    /// @return ownedBalance the only user balance
    function tokenBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 balance, uint256 ownedBalance);

    /// @notice The function for getting nft balance of one user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param useDelegated the boolean flag, if true then balance calculates with delegations
    /// @return balance the balance with delegations
    /// @return ownedBalance the only user balance
    function nftBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 balance, uint256 ownedBalance);

    /// @notice The function for getting nft ids of one user
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param useDelegated the boolean flag, if true then balance calculates with delegations
    /// @return nfts the array of nft ids
    /// @return ownedLength the length of array
    function nftExactBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256[] memory nfts, uint256 ownedLength);

    /// @notice The function for getting nft power from snapshot
    /// @param nftIds the array of nft ids
    /// @param snapshotId the id of snapshot
    /// @return `balance` of nfts
    function getNftsPowerInTokensBySnapshot(
        uint256[] calldata nftIds,
        uint256 snapshotId
    ) external view returns (uint256);

    /// @notice The function for getting total vote power of contract
    /// @return `total` power
    function getTotalVoteWeight() external view returns (uint256);

    /// @notice The function for define if voter can vote or create proposal
    /// @param voter the address of voter
    /// @param isMicropool the boolean flag, if true then uses micropool
    /// @param useDelegated the boolean flag, if true then balance calculates with delegations
    /// @param requiredVotes the required vote power
    /// @param snapshotId the id of snapshot
    /// @return `true` - can participate, `false` - can't participate
    function canParticipate(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view returns (bool);

    /// @notice The function for getting voting power of users
    /// @param users the array of users addresses
    /// @param isMicropools the array of boolean flags
    /// @param useDelegated the array of boolean flags
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

    /// @notice The function for getting informtion about delegations for one user
    /// @param user the address of user
    /// @return power the total delegated power
    /// @return delegationsInfo the array of DelegationInfoView structs
    function delegations(
        address user
    ) external view returns (uint256 power, DelegationInfoView[] memory delegationsInfo);

    /// @notice The function for getting information about funds that can't be undelegated
    /// @param delegator the delegator address
    /// @param delegatee the delegatee address
    /// @param lockedProposals the array of ids of proposals
    /// @param unlockedNfts the array of unlocked nfts
    function getUndelegateableAssets(
        address delegator,
        address delegatee,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        external
        view
        returns (
            uint256 undelegateableTokens,
            ShrinkableArray.UintArray memory undelegateableNfts
        );

    /// @notice The function for getting information about funds that can be undelegated
    /// @param voter the address of voter
    /// @param lockedProposals the array of ids of proposals
    /// @param unlockedNfts the array of unlocked nfts
    function getWithdrawableAssets(
        address voter,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts);

    function getDelegatees(address delegator) external view returns (address[] memory);

    function getDelegatedStakeAmount(
        address delegator,
        address delegatee
    ) external view returns (uint256);
}
