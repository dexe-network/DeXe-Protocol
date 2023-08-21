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

    mapping(uint256 => NftInfo) internal _tokens;
    mapping(address => uint256) internal _latestLockedTokenIds;

    event Minted(
        address to,
        uint256 tokenId,
        uint256 multiplier,
        uint256 duration,
        uint256 averageBalance
    );
    event Locked(
        address sender,
        uint256 tokenId,
        uint256 multiplier,
        uint256 duration,
        bool isLocked
    );
    event Changed(uint256 tokenId, uint256 multiplier, uint256 duration, uint256 averageBalance);

    function __ERC721Multiplier_init(
        string calldata name,
        string calldata symbol
    ) public initializer {
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

        NftInfo storage tokenToBeLocked = _tokens[tokenId];

        tokenToBeLocked.lockedAt = uint64(block.timestamp);
        _latestLockedTokenIds[msg.sender] = tokenId;

        emit Locked(
            msg.sender,
            tokenId,
            tokenToBeLocked.multiplier,
            tokenToBeLocked.duration,
            true
        );
    }

    function unlock() external override {
        uint256 tokenId = _latestLockedTokenIds[msg.sender];

        _onlyTokenOwner(tokenId);

        require(isLocked(tokenId), "ERC721Multiplier: Nft is not locked");

        require(
            IGovPool(owner()).getUserActiveProposalsCount(msg.sender) == 0,
            "ERC721Multiplier: Cannot unlock with active proposals"
        );

        NftInfo storage tokenToBeUnlocked = _tokens[tokenId];

        tokenToBeUnlocked.lockedAt = 0;

        emit Locked(
            msg.sender,
            tokenId,
            tokenToBeUnlocked.multiplier,
            tokenToBeUnlocked.duration,
            false
        );
    }

    function mint(
        address to,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) public virtual override onlyOwner {
        uint256 currentTokenId = totalSupply() + 1;

        _mint(to, currentTokenId);

        _tokens[currentTokenId] = NftInfo({
            multiplier: multiplier,
            duration: duration,
            lockedAt: 0
        });

        emit Minted(to, currentTokenId, multiplier, duration, averageBalance);
    }

    function changeToken(
        uint256 tokenId,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) public virtual override onlyOwner {
        _requireMinted(tokenId);

        NftInfo storage token = _tokens[tokenId];

        token.multiplier = multiplier;
        token.duration = duration;

        emit Changed(tokenId, multiplier, duration, averageBalance);
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function getExtraRewards(
        address whose,
        uint256 rewards
    ) external view override returns (uint256) {
        (uint256 multiplier, ) = getCurrentMultiplier(whose, rewards);

        return multiplier == 0 ? 0 : rewards.ratio(multiplier, PRECISION);
    }

    function getCurrentMultiplier(
        address whose,
        uint256
    ) public view virtual returns (uint256 multiplier, uint256 timeLeft) {
        uint256 latestLockedTokenId = _latestLockedTokenIds[whose];

        if (!isLocked(latestLockedTokenId)) {
            return (0, 0);
        }

        NftInfo storage info = _tokens[latestLockedTokenId];

        multiplier = info.multiplier;
        timeLeft = info.lockedAt + info.duration - block.timestamp;
    }

    function isLocked(uint256 tokenId) public view override returns (bool) {
        NftInfo storage info = _tokens[tokenId];

        return info.lockedAt != 0 && info.lockedAt + info.duration >= block.timestamp;
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
        require(!isLocked(tokenId), "ERC721Multiplier: Cannot transfer locked token");

        if (_latestLockedTokenIds[from] == tokenId) {
            _latestLockedTokenIds[from] = 0;
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
