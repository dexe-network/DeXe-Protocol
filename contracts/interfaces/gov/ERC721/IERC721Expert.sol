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

    function burnAuth(uint256 tokenId) external view returns (BurnAuth);

    function baseURI() external view returns (string memory);

    function isExpert(address expert) external view returns (bool);

    function getIdByExpert(address expert) external view returns (uint);

    function mint(address to, string calldata uri_) external returns (uint tokenId);

    function burn(uint tokenId) external;
}
