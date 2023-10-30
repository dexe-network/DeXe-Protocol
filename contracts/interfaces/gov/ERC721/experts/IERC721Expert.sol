// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IERC721Expert is IERC721Upgradeable {
    enum BurnAuth {
        IssuerOnly,
        OwnerOnly,
        Both,
        Neither
    }

    event Issued(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        BurnAuth burnAuth
    );
    event TagsAdded(uint256 indexed tokenId, string[] tags);

    function burn(address from) external;

    function isExpert(address expert) external view returns (bool);

    function getIdByExpert(address expert) external view returns (uint256);

    function burnAuth(uint256 tokenId) external view returns (BurnAuth);
}
