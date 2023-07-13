// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";

import "../../interfaces/gov/ERC721/IERC721Expert.sol";

contract ERC721Expert is IERC721Expert, ERC721URIStorageUpgradeable, OwnableUpgradeable {
    uint256 private _maxIssued;

    mapping(address => uint256) private _attachments;

    function __ERC721Expert_init(
        string calldata name,
        string calldata symbol
    ) external initializer {
        __Ownable_init();
        __ERC721_init(name, symbol);
    }

    function mint(address to, string calldata uri_) external onlyOwner returns (uint256 tokenId) {
        require(!isExpert(to), "ERC721Expert: Cannot mint more than one expert badge");

        tokenId = ++_maxIssued;

        _mint(to, tokenId);
        _setTokenURI(tokenId, uri_);
        _attachments[to] = tokenId;

        emit Issued(owner(), to, tokenId, BurnAuth.OwnerOnly);
    }

    function burn(uint256 tokenId) external onlyOwner {
        require(_exists(tokenId), "ERC721Expert: Cannot burn non-existent badge");

        address _expert = ownerOf(tokenId);

        _burn(tokenId);
        delete _attachments[_expert];
    }

    function setTokenURI(uint256 tokenId, string calldata uri_) external onlyOwner {
        _setTokenURI(tokenId, uri_);
    }

    function isExpert(address expert) public view returns (bool) {
        return balanceOf(expert) == 1;
    }

    function getIdByExpert(address expert) public view returns (uint256) {
        require(isExpert(expert), "ERC721Expert: User is not an expert");

        return _attachments[expert];
    }

    function burnAuth(uint256 tokenId) external view override returns (BurnAuth) {
        require(_exists(tokenId), "ERC721Expert: Cannot find Burn Auth for non existant badge");

        return BurnAuth.OwnerOnly;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
        return
            interfaceId == bytes4(0x0489b56f) || // EIP-5484
            interfaceId == type(IERC721Expert).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function _transfer(address, address, uint256) internal pure override {
        revert("ERC721Expert: Expert badge cannot be transferred");
    }
}
