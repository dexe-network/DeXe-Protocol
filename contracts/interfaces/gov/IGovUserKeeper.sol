// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../libs/ShrinkableArray.sol";

interface IGovUserKeeper {
    struct NFTInfo {
        bool isSupportPower;
        bool isSupportTotalSupply;
        /// @dev Power of all NFTs in tokens
        uint256 totalPowerInTokens;
        /// @dev If NFT unsupported IERC721Enumerable and Power, this value must be set
        uint256 totalSupply;
    }

    struct NFTSnapshot {
        /// @dev For NFT with power
        uint256 totalNftsPower;
        mapping(uint256 => uint256) nftPower;
        /// @dev For NFT with `totalSupply()`
        uint256 totalSupply;
    }

    function tokenBalance(address user) external view returns (uint256);

    function delegatedTokens(address holder, address spender) external view returns (uint256);

    /**
     * @notice Add tokens to the `holder` balance
     * @param holder Holder
     * @param amount Token amount. Wei
     */
    function depositTokens(address holder, uint256 amount) external;

    /**
     * @notice Delegate (approve) tokens from `msg.sender` to `spender`
     * @param spender Spender
     * @param amount Token amount. Wei
     */
    function delegateTokens(address spender, uint256 amount) external;

    /**
     * @notice Withdraw tokens from balance
     * @param amount Token amount. Wei
     */
    function withdrawTokens(uint256 amount) external;

    /**
     * @notice Add NFTs to the `holder` balance
     * @param holder Holder
     * @param nftIds NFTs. Array [1, 34, ...]
     */
    function depositNfts(address holder, uint256[] calldata nftIds) external;

    /**
     * @notice Delegate (approve) NFTs from `msg.sender` to `spender`
     * @param spender Spender
     * @param nftIds NFTs. Array [1, 34, ...]
     * @param delegationStatus. Array [true, false, ...]. If `true`, delegate nft to `spender`
     */
    function delegateNfts(
        address spender,
        uint256[] calldata nftIds,
        bool[] calldata delegationStatus
    ) external;

    /**
     * @notice Withdraw NFTs from balance
     * @param nftIds NFT Ids
     */
    function withdrawNfts(uint256[] calldata nftIds) external;

    /**
     * @return bool `true` if NFT contract support `Power` interface
     * @return bool `true` if NFT contract support `Enumerable` interface
     * @return uint256 Total power of all NFTs in tokens
     * @return uint256 Total supply if NFT contract isn't support `Power` and `Enumerable` interface
     */
    function getNftContractInfo()
        external
        view
        returns (
            bool,
            bool,
            uint256,
            uint256
        );

    /**
     * @param user Holder address
     * @return uint256 Actual token balance. Wei
     * @return uint256 Actual locked amount. Wei
     */
    function tokenBalanceOf(address user) external view returns (uint256, uint256);

    /**
     * @param user Holder address
     * @return uint256 Actual NFTs count on balance
     * @return uint256 Actual locked NFTs count on balance
     */
    function nftBalanceCountOf(address user) external view returns (uint256, uint256);

    function delegatedNftsCountOf(address holder, address spender) external view returns (uint256);

    /**
     * @param user Holder address
     * @param offset Index in array
     * @param limit NFTs limit
     * @return uint256[] NFTs on balance
     */
    function nftBalanceOf(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory);

    /**
     * @param user Holder address
     * @param offset Index in array
     * @param limit NFTs limit
     * @return uint256[] Locked NFTs
     * @return uint256[] Locked num for each locked NFT
     */
    function nftLockedBalanceOf(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory, uint256[] memory);

    /**
     * @param holder Main token holder address
     * @param spender Spender address
     * @param offset Index in array
     * @param limit NFTs limit
     * @return Delegated NFTs. Array
     */
    function getDelegatedNfts(
        address holder,
        address spender,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory);

    /**
     * @return uint256 Total vote amount for each proposal
     * @dev Participates in the quorum calculation
     */
    function getTotalVoteWeight() external view returns (uint256);

    /**
     * @notice Calculate certain NFTs power by `snapshotId`
     * @param nftIds NFT IDs
     * @param snapshotId Snapshot ID
     * @return uint256 Nft power in tokens
     */
    function getNftsPowerInTokens(ShrinkableArray.UintArray calldata nftIds, uint256 snapshotId)
        external
        view
        returns (uint256);

    /**
     * @param delegate Spender address
     * @param holder Main token holder address
     * @param nftIds Array of NFTs that should be filtered
     * @return Return filtered input array, where only delegated NFTs
     */
    function filterNftsAvailableForDelegator(
        address delegate,
        address holder,
        ShrinkableArray.UintArray calldata nftIds
    ) external view returns (ShrinkableArray.UintArray memory);

    /**
     * @notice Create NFTs power snapshot
     * @return Return NFTs power snapshot ID
     */
    function createNftPowerSnapshot() external returns (uint256);

    /**
     * @notice Lock tokens. Locked tokens unavailable to transfer from contract
     * @param voter Voter address
     * @param amount Token amount. Wei
     */
    function lockTokens(
        address voter,
        uint256 amount,
        uint256 proposalId
    ) external;

    /**
     * @notice Unlock tokens
     * @param voter Holder address
     * @param proposalId Proposal ID
     */
    function unlockTokens(address voter, uint256 proposalId) external;

    /**
     * @notice Filters incoming NFTs (`nftIds`) by existing on balance and locks them
     * @param voter NFT owner address. If NFT is not on contract or owner is other address, skip it
     * @param nftIds List of NFT ids to lock.
     * @return uint256[] Array with locked nftIds
     */
    function lockNfts(address voter, ShrinkableArray.UintArray calldata nftIds)
        external
        returns (ShrinkableArray.UintArray memory);

    /**
     * @notice Unlock incoming `nftIds`
     * @param voter Holder address
     * @param nftIds List of NFT ids to unlock
     */
    function unlockNfts(address voter, uint256[] calldata nftIds) external;

    /**
     * @notice Checks the user's balance
     * @param user Holder address
     * @param requiredTokens Minimal require tokens amount
     * @param requiredNfts Minimal require nfts amount
     */
    function canUserParticipate(
        address user,
        uint256 requiredTokens,
        uint256 requiredNfts
    ) external view returns (bool);
}
