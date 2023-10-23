// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../gov/ERC721/ERC721Power.sol";

contract ERC721PowerMock is ERC721Power {
    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }
}
