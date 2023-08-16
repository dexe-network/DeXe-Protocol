// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/ERC721/IERC721Multiplier.sol";
import "../../core/Globals.sol";

import "../../libs/math/MathHelper.sol";

contract ERC721Multiplier is IERC721Multiplier, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    using MathHelper for uint256;

    string public baseURI;

    mapping(uint256 => NftInfo) private _tokens;
    mapping(address => uint256) private _latestLockedTokenIds;

    event Minted(address to, uint256 tokenId, uint256 multiplier, uint256 duration);
    event Locked(address from, uint256 tokenId, uint256 multiplier, uint256 duration);
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
        require(
            !isLocked(_latestLockedTokenIds[msg.sender]),
            "ERC721Multiplier: Cannot lock more than one nft"
        );

        _transfer(msg.sender, address(this), tokenId);

        NftInfo storage tokenToBeLocked = _tokens[tokenId];

        tokenToBeLocked.lockedAt = uint64(block.timestamp);
        _latestLockedTokenIds[msg.sender] = tokenId;

        emit Locked(msg.sender, tokenId, tokenToBeLocked.multiplier, tokenToBeLocked.duration);
    }

    function mint(address to, uint256 multiplier, uint64 duration) external override onlyOwner {
        uint256 currentTokenId = totalSupply() + 1;

        _mint(to, currentTokenId);

        _tokens[currentTokenId] = NftInfo({
            multiplier: multiplier,
            duration: duration,
            lockedAt: 0
        });

        emit Minted(to, currentTokenId, multiplier, duration);
    }

    function changeToken(uint256 tokenId, uint256 multiplier, uint64 duration) external onlyOwner {
        require(
            _exists(tokenId) && !isLocked(tokenId),
            "ERC721Multiplier: Cannot change this token"
        );

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
        uint256 latestLockedTokenId = _latestLockedTokenIds[whose];

        return
            isLocked(latestLockedTokenId)
                ? rewards.ratio(_tokens[latestLockedTokenId].multiplier, PRECISION)
                : 0;
    }

    function getCurrentMultiplier(
        address whose
    ) external view returns (uint256 multiplier, uint256 timeLeft) {
        uint256 latestLockedTokenId = _latestLockedTokenIds[whose];

        if (!isLocked(latestLockedTokenId)) {
            return (0, 0);
        }

        NftInfo memory info = _tokens[latestLockedTokenId];

        multiplier = info.multiplier;
        timeLeft = info.lockedAt + info.duration - block.timestamp;
    }

    function isLocked(uint256 tokenId) public view override returns (bool) {
        NftInfo memory info = _tokens[tokenId];

        return info.lockedAt != 0 && info.lockedAt + info.duration >= block.timestamp;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(IERC165Upgradeable, ERC721EnumerableUpgradeable) returns (bool) {
        return
            interfaceId == type(IERC721Multiplier).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
