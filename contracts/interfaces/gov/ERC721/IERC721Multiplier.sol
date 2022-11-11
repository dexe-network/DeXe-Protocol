// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

interface IERC721Multiplier is IERC721Enumerable {
    struct NftInfo {
        uint256 multiplier;
        uint256 duration;
        uint256 lockedAt;
    }

    function lock(uint256 tokenId) external;

    function mint(
        address to,
        uint256 multiplier,
        uint256 duration
    ) external;

    function getExtraRewards(address whose, uint256 rewards) external view returns (uint256);

    function getCurrentMultiplier(address whose)
        external
        view
        returns (uint256 multiplier, uint256 timeLeft);

    function isLocked(uint256 tokenId) external view returns (bool);
}
