// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

interface IERC721Power is IERC721Enumerable {
    struct NftInfo {
        uint64 lastUpdate;
        uint256 currentPower;
        uint256 currentCollateral;
        uint256 maxPower;
        uint256 requiredCollateral;
    }

    /**
     * @notice Set reduction percent. 100% = 10^27.
     * @param _reductionPercent Decimals.
     */
    function setReductionPercent(uint256 _reductionPercent) external;

    /**
     * @notice Set max possible power (coefficient) for all nfts.
     * @param _maxPower Decimals.
     */
    function setMaxPower(uint256 _maxPower) external;

    /**
     * @notice Set max possible power (coefficient) for certain nft.
     * @param _maxPower Decimals.
     * @param tokenId Nft number.
     */
    function setNftMaxPower(uint256 _maxPower, uint256 tokenId) external;

    /**
     * @notice Set collateral token address.
     * @param _collateralToken Address.
     */
    function setCollateralToken(address _collateralToken) external;

    /**
     * @notice Set required collateral amount for all nfts.
     * @param amount Wei.
     */
    function setRequiredCollateral(uint256 amount) external;

    /**
     * @notice Set required collateral amount for certain nft.
     * @param amount Wei.
     * @param tokenId Nft number.
     */
    function setNftRequiredCollateral(uint256 amount, uint256 tokenId) external;

    /**
     * @notice Mint new nft.
     * @param to Address.
     * @param tokenId Nft number.
     */
    function safeMint(address to, uint256 tokenId) external;

    /**
     * @notice Add collateral amount to certain nft.
     * @param amount Wei.
     * @param tokenId Nft number.
     */
    function addCollateral(uint256 amount, uint256 tokenId) external;

    /**
     * @notice Remove collateral amount from certain nft.
     * @param amount Wei.
     * @param tokenId Nft number.
     */
    function removeCollateral(uint256 amount, uint256 tokenId) external;

    /**
     * @notice Recalculate nft power (coefficient).
     * @param tokenId Nft number.
     */
    function recalculateNftPower(uint256 tokenId) external returns (uint256);

    /**
     * @notice Return max possible power (coefficient) for nft.
     * @param tokenId Nft number.
     */
    function getMaxPowerForNft(uint256 tokenId) external view returns (uint256);

    /**
     * @notice Return required collateral amount for nft.
     * @param tokenId Nft number.
     */
    function getRequiredCollateralForNft(uint256 tokenId) external view returns (uint256);
}
