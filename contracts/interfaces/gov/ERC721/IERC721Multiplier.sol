// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol";

/**
 * This is the special NFT contract which behaves like a coupon that can be locked to receive
 * certain extra rewards in the Governance pool contract
 */
interface IERC721Multiplier is IERC721EnumerableUpgradeable {
    /// @notice This struct holds NFT Multiplier parameters
    /// @param multiplier the basic rewards multiplier
    /// @param duration the time for which an nft can be locked
    /// @param lockedAt the time nft was locked
    struct NftInfo {
        uint256 multiplier;
        uint64 duration;
        uint64 lockedAt;
    }

    /// @notice This function is used to lock an nft (enable corresponding basic rewards multiplier). Only one NFT for each address can be locked at the same time
    /// @param tokenId the id of the nft to be locked
    function lock(uint256 tokenId) external;

    /// @notice This function is used to unlock an nft (disable corresponding basic rewards multiplier)
    /// @param tokenId the id of the nft to be unlocked
    function unlock(uint256 tokenId) external;

    /// @notice This function is used to mint an nft to the user's address
    /// @param to the address to which an nft should be minted
    /// @param multiplier the basic rewards multiplier
    /// @param duration the time for which an nft can be locked
    function mint(address to, uint256 multiplier, uint64 duration) external;

    /// @notice This function is used to change the basic rewards multiplier and the time for which the current nft will be locked
    /// @param tokenId the id of the nft to be changed
    /// @param multiplier the basic rewards multiplier
    /// @param duration the time for which an nft can be locked
    function changeToken(uint256 tokenId, uint256 multiplier, uint64 duration) external;

    /// @notice This function is used to calculate extra rewards
    /// @param whose the address of the user who is to receive extra rewards
    /// @param rewards basic rewards to be multiplied
    /// @return extra rewards
    function getExtraRewards(address whose, uint256 rewards) external view returns (uint256);

    /// @notice This function is used to get the current basic rewards multiplier and the time for which the current nft will be locked
    /// @param whose the address of the user to be checked
    /// @return multiplier the basic rewards multiplier
    /// @return timeLeft seconds remaining before the current locked nft expires
    function getCurrentMultiplier(
        address whose
    ) external view returns (uint256 multiplier, uint256 timeLeft);

    /// @notice This function is used to check whether the passed nft id is locked
    /// @param tokenId the id of the nft
    /// @return false if nft has expired or hasn't yet been locked, otherwise true
    function isLocked(uint256 tokenId) external view returns (bool);
}
