// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AbstractERC721Power.sol";

contract ERC721RawPower is AbstractERC721Power {
    function __ERC721RawPower_init(
        string calldata name,
        string calldata symbol,
        uint64 startTimestamp,
        address _collateralToken,
        uint256 _reductionPercent,
        uint256 _nftMaxRawPower,
        uint256 _nftRequiredCollateral
    ) external initializer {
        __AbstractERC721Power_init(
            name,
            symbol,
            startTimestamp,
            _collateralToken,
            _reductionPercent,
            _nftMaxRawPower,
            _nftRequiredCollateral
        );
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        _addCollateral(amount, tokenId);
    }

    function removeCollateral(uint256 amount, uint256 tokenId) external override {
        _removeCollateral(amount, tokenId);
    }

    function recalculateNftPowers(uint256[] calldata tokenIds) external override {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _recalculateRawNftPower(tokenIds[i]);
        }
    }

    function totalPower() external view override returns (uint256) {
        return totalRawPower;
    }

    function getNftMaxPower(uint256 tokenId) external view override returns (uint256) {
        return _getRawNftMaxPower(tokenId);
    }

    function getNftPower(uint256 tokenId) external view override returns (uint256) {
        return _getRawNftPower(tokenId);
    }

    function getNftRequiredCollateral(uint256 tokenId) external view override returns (uint256) {
        return _getNftRequiredCollateral(tokenId);
    }
}
