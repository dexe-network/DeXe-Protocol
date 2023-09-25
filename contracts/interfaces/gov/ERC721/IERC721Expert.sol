// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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

    function mint(address to, string calldata uri_) external returns (uint256 tokenId);

    function burn(address from) external;

    function setTokenURI(uint256 tokenId, string calldata uri_) external;

    function isExpert(address expert) external view returns (bool);

    function getIdByExpert(address expert) external view returns (uint256);

    function burnAuth(uint256 tokenId) external view returns (BurnAuth);
}
