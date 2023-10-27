// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol";

/**
 * This is the custom NFT contract with voting power
 */
interface IERC721Power is IERC721EnumerableUpgradeable {
    /// @notice This struct holds NFT Power parameters. These parameters are used to recalculate nft power
    /// @param lastUpdate the last time when the power was recalculated
    /// @param currentPower the current nft power
    /// @param currentCollateral the current nft collateral
    /// @param maxPower the maximum nft power limit
    /// @param requiredCollateral the required collateral amount
    struct NftInfo {
        uint64 lastUpdate;
        uint256 maxRawPower;
        uint256 currentRawPower;
        uint256 requiredCollateral;
        uint256 currentCollateral;
    }

    /// @notice Add collateral amount to certain nft
    /// @param amount Wei
    /// @param tokenId Nft number
    function addCollateral(uint256 amount, uint256 tokenId) external;

    /// @notice Remove collateral amount from certain nft
    /// @param amount Wei
    /// @param tokenId Nft number
    function removeCollateral(uint256 amount, uint256 tokenId) external;

    /// @notice Recalculate nft power (coefficient)
    /// @param tokenIds Nft numbers
    function recalculateNftPowers(uint256[] calldata tokenIds) external;

    /// @notice Get total power
    /// @return totalPower
    function totalPower() external view returns (uint256);

    /// @notice Return max possible power (coefficient) for nft
    /// @param tokenId Nft number
    /// @return max power for Nft
    function getNftMaxPower(uint256 tokenId) external view returns (uint256);

    /// @notice The function to get current NFT power
    /// @param tokenId the Nft number
    /// @return current power of the Nft
    function getNftPower(uint256 tokenId) external view returns (uint256);

    /// @notice Return required collateral amount for nft
    /// @param tokenId Nft number
    /// @return required collateral for Nft
    function getNftRequiredCollateral(uint256 tokenId) external view returns (uint256);
}
