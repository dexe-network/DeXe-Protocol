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

    function mint(
        address to,
        uint256 multiplier,
        uint256 duration
    ) external;

    function getRewardMultiplier(address whose) external view returns (uint256);

    function lock(uint256 tokenId) external;
}
