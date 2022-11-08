// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";
import "../../core/Globals.sol";

contract ERC721Multiplier is IERC721Multiplier, ERC721Enumerable, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    string public baseURI;
    Counters.Counter private _tokenIds;
    mapping(uint256 => NftInfo) private _tokens;
    mapping(address => uint256) private _latestLockedTokenIds;

    event Minted(address indexed to, uint256 tokenId, uint256 multiplier, uint256 duration);
    event Locked(address indexed from, uint256 tokenId, uint256 multipier, uint256 duration);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    function mint(
        address to,
        uint256 multiplier,
        uint256 duration
    ) external override onlyOwner {
        _tokenIds.increment();

        uint256 tokenId = _tokenIds.current();
        _mint(to, tokenId);

        _tokens[tokenId] = NftInfo({multiplier: multiplier, duration: duration, lockedAt: 0});

        emit Minted(to, tokenId, multiplier, duration);
    }

    function getExtraRewards(address whose, uint256 rewards)
        external
        view
        override
        returns (uint256)
    {
        NftInfo memory info = _tokens[_latestLockedTokenIds[whose]];

        return _isLocked(info) ? (rewards * info.multiplier) / PRECISION : 0;
    }

    function lock(uint256 tokenId) external override {
        NftInfo memory info = _tokens[_latestLockedTokenIds[msg.sender]];

        require(!_isLocked(info), "ERC721Multiplier: Cannot lock more than one nft");

        _transfer(msg.sender, address(this), tokenId);

        NftInfo storage tokenToBeLocked = _tokens[tokenId];
        tokenToBeLocked.lockedAt = block.timestamp;

        _latestLockedTokenIds[msg.sender] = tokenId;

        emit Locked(msg.sender, tokenId, tokenToBeLocked.multiplier, tokenToBeLocked.duration);
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function setTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _setTokenURI(tokenId, uri);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        ERC721URIStorage._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Multiplier).interfaceId ||
            ERC721Enumerable.supportsInterface(interfaceId);
    }

    function _isLocked(NftInfo memory info) private view returns (bool) {
        return info.lockedAt != 0 && info.lockedAt + info.duration >= block.timestamp;
    }
}
