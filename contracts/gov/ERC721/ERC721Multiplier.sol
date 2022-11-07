// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";

contract ERC721Multiplier is IERC721Multiplier, ERC721Enumerable, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    mapping(uint256 => NftInfo) private _tokens;
    mapping(address => uint256) private _latestLockedTokenIds;

    event Minted(address to, uint256 tokenId, uint256 multiplier, uint256 duration);
    event Locked(address from, uint256 tokenId, uint256 multipier, uint256 duration);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    function mint(
        address to,
        uint256 multiplier,
        uint256 duration
    ) external onlyOwner {
        _tokenIds.increment();

        uint256 tokenId = _tokenIds.current();
        _mint(to, tokenId);

        _tokens[tokenId] = NftInfo({multiplier: multiplier, duration: duration, lockedAt: 0});

        emit Minted(to, tokenId, multiplier, duration);
    }

    function getRewardMultiplier(address whose) external view returns (uint256) {
        NftInfo memory info = _tokens[_latestLockedTokenIds[whose]];

        return info.lockedAt + info.duration >= block.timestamp ? info.multiplier : 0;
    }

    function lock(uint256 tokenId) external {
        uint256 latestLockedTokenId = _latestLockedTokenIds[msg.sender];

        NftInfo memory info = _tokens[latestLockedTokenId];

        require(
            latestLockedTokenId == 0 || info.lockedAt + info.duration < block.timestamp,
            "ERC721Multiplier: Cannot lock more than one nft"
        );

        _transfer(msg.sender, address(this), tokenId);

        NftInfo storage tokenToBeLocked = _tokens[tokenId];
        tokenToBeLocked.lockedAt = block.timestamp;

        emit Locked(msg.sender, tokenId, tokenToBeLocked.multiplier, tokenToBeLocked.duration);
    }
}
