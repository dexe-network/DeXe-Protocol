// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";
import "../../core/Globals.sol";

import "../../libs/math/MathHelper.sol";

contract ERC721Multiplier is IERC721Multiplier, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    using MathHelper for uint256;

    string public baseURI;

    mapping(uint256 => NftInfo) private _tokens;
    mapping(address => uint256) private _latestLockedTokenIds;

    event Minted(uint256 tokenId, address to, uint256 multiplier, uint256 duration);
    event Locked(uint256 tokenId, address sender, bool isLocked);
    event Changed(uint256 tokenId, uint256 multiplier, uint256 duration);

    function __ERC721Multiplier_init(
        string calldata name,
        string calldata symbol
    ) external initializer {
        __Ownable_init();
        __ERC721Enumerable_init();
        __ERC721_init(name, symbol);
    }

    function lock(uint256 tokenId) external override {
        _onlyTokenOwner(tokenId);

        require(
            !isLocked(_latestLockedTokenIds[msg.sender]),
            "ERC721Multiplier: Cannot lock more than one nft"
        );

        _latestLockedTokenIds[msg.sender] = tokenId;

        emit Locked(tokenId, msg.sender, true);
    }

    function unlock() external override {
        uint256 tokenId = _latestLockedTokenIds[msg.sender];

        _onlyTokenOwner(tokenId);

        require(isLocked(tokenId), "ERC721Multiplier: Nft is not locked");
        require(
            IGovPool(owner()).getUserActiveProposalsCount(msg.sender) == 0,
            "ERC721Multiplier: Cannot unlock with active proposals"
        );

        delete _latestLockedTokenIds[msg.sender];

        emit Locked(tokenId, msg.sender, false);
    }

    function mint(address to, uint256 multiplier, uint64 duration) external override onlyOwner {
        uint256 currentTokenId = totalSupply() + 1;

        _mint(to, currentTokenId);

        _tokens[currentTokenId] = NftInfo({
            multiplier: multiplier,
            duration: duration,
            mintedAt: uint64(block.timestamp)
        });

        emit Minted(currentTokenId, to, multiplier, duration);
    }

    function changeToken(
        uint256 tokenId,
        uint256 multiplier,
        uint64 duration
    ) external override onlyOwner {
        _requireMinted(tokenId);

        NftInfo storage token = _tokens[tokenId];

        token.multiplier = multiplier;
        token.duration = duration;

        emit Changed(tokenId, multiplier, duration);
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function getExtraRewards(
        address whose,
        uint256 rewards
    ) external view override returns (uint256) {
        (uint256 multiplier, ) = getCurrentMultiplier(whose);

        return rewards.ratio(multiplier, PRECISION);
    }

    function getCurrentMultiplier(
        address whose
    ) public view returns (uint256 multiplier, uint256 timeLeft) {
        uint256 latestLockedTokenId = _latestLockedTokenIds[whose];

        if (!isLocked(latestLockedTokenId)) {
            return (0, 0);
        }

        NftInfo memory info = _tokens[latestLockedTokenId];

        if (info.mintedAt + info.duration < block.timestamp) {
            return (0, 0);
        }

        return (info.multiplier, info.mintedAt + info.duration - block.timestamp);
    }

    function isLocked(uint256 tokenId) public view override returns (bool) {
        return tokenId != 0 && _latestLockedTokenIds[ownerOf(tokenId)] == tokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(IERC165Upgradeable, ERC721EnumerableUpgradeable) returns (bool) {
        return
            interfaceId == type(IERC721Multiplier).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        if (from != address(0)) {
            require(!isLocked(tokenId), "ERC721Multiplier: Cannot transfer locked token");
        }

        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _onlyTokenOwner(uint256 tokenId) internal view {
        require(ownerOf(tokenId) == msg.sender, "ERC721Multiplier: not the nft owner");
    }
}
