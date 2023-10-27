// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../../gov/ERC721/powers/ERC721RawPower.sol";

contract ERC721RawPowerMock is ERC721RawPower {
    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }
}
