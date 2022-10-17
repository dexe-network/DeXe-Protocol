// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/**
 * This is the custom NFT contract with voting power
 */
interface IERC721Power is IERC721Enumerable {
    struct NftInfo {
        uint64 lastUpdate;
        uint256 currentPower;
        uint256 currentCollateral;
        uint256 maxPower;
        uint256 requiredCollateral;
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
    /// @param tokenId Nft number
    /// @return new Nft power
    /// @return collateral amount under the Nft
    function recalculateNftPower(uint256 tokenId) external returns (uint256, uint256);

    /// @notice Return max possible power (coefficient) for nft
    /// @param tokenId Nft number
    /// @return max power for Nft
    function getMaxPowerForNft(uint256 tokenId) external view returns (uint256);

    /// @notice Return required collateral amount for nft
    /// @param tokenId Nft number
    /// @return required collateral for Nft
    function getRequiredCollateralForNft(uint256 tokenId) external view returns (uint256);

    /// @notice The function to get current NFT power
    /// @param tokenId the Nft number
    /// @return current power of the Nft
    /// @return collateral amount under the Nft
    function getNftPower(uint256 tokenId) external view returns (uint256, uint256);
}
