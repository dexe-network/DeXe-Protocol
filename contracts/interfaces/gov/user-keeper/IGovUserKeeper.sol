// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../../libs/data-structures/ShrinkableArray.sol";

/**
 * This contract is responsible for securely storing user's funds that are used during the voting. These are either
 * ERC20 tokens or NFTs
 */
interface IGovUserKeeper {
    struct BalanceInfo {
        uint256 tokenBalance;
        uint256 maxTokensLocked;
        mapping(uint256 => uint256) lockedInProposals; // proposal id => locked amount
        EnumerableSet.UintSet nftBalance; // array of NFTs
    }

    struct UserInfo {
        BalanceInfo balanceInfo;
        mapping(address => uint256) delegatedTokens; // delegatee => amount
        mapping(address => EnumerableSet.UintSet) delegatedNfts; // delegatee => tokenIds
        EnumerableSet.AddressSet delegatees;
    }

    struct NFTInfo {
        bool isSupportPower;
        uint256 totalPowerInTokens;
        uint256 totalSupply;
    }

    struct VotingPowerView {
        uint256 power;
        uint256 nftPower;
        uint256[] perNftPower;
        uint256 ownedBalance;
        uint256 ownedLength;
        uint256[] nftIds;
    }

    struct DelegationInfoView {
        address delegatee;
        uint256 delegatedTokens;
        uint256[] delegatedNfts;
        uint256 nftPower;
        uint256[] perNftPower;
    }

    function depositTokens(address payer, address receiver, uint256 amount) external;

    function withdrawTokens(address payer, address receiver, uint256 amount) external;

    function delegateTokens(address delegator, address delegatee, uint256 amount) external;

    function undelegateTokens(address delegator, address delegatee, uint256 amount) external;

    function depositNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    function withdrawNfts(address payer, address receiver, uint256[] calldata nftIds) external;

    function delegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    function undelegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external;

    function createNftPowerSnapshot() external returns (uint256);

    function updateMaxTokenLockedAmount(
        uint256[] calldata lockedProposals,
        address voter,
        bool isMicropool
    ) external;

    function lockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool,
        uint256 amount
    ) external;

    function unlockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external returns (uint256 unlockedAmount);

    function lockNfts(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256[] calldata nftIds
    ) external;

    function unlockNfts(uint256[] calldata nftIds) external;

    function updateNftPowers(uint256[] calldata nftIds) external;

    function setERC20Address(address _tokenAddress) external;

    function setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) external;

    function getNftInfo() external view returns (NFTInfo memory);

    function maxLockedAmount(address voter, bool isMicropool) external view returns (uint256);

    function tokenBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 balance, uint256 ownedBalance);

    function nftBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256 balance, uint256 ownedBalance);

    function nftExactBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) external view returns (uint256[] memory nfts, uint256 ownedLength);

    function getNftsPowerInTokensBySnapshot(
        uint256[] calldata nftIds,
        uint256 snapshotId
    ) external view returns (uint256);

    function getTotalVoteWeight() external view returns (uint256);

    function canParticipate(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view returns (bool);

    function votingPower(
        address[] calldata users,
        bool[] calldata isMicropools,
        bool[] calldata useDelegated
    ) external view returns (VotingPowerView[] memory votingPowers);

    function nftVotingPower(
        uint256[] memory nftIds
    ) external view returns (uint256 nftPower, uint256[] memory perNftPower);

    function delegations(
        address user
    ) external view returns (uint256 power, DelegationInfoView[] memory delegationsInfo);

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
