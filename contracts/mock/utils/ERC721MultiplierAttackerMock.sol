// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/ERC721/multipliers/IAbstractERC721Multiplier.sol";

contract ERC721MultiplierAttackerMock {
    function attack(IAbstractERC721Multiplier erc721Multiplier, uint256 tokenId) external {
        erc721Multiplier.lock(tokenId);
        erc721Multiplier.unlock();
    }
}