// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./AbstractERC721Multiplier.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/ERC721/multipliers/IERC721Multiplier.sol";
import "../../../core/Globals.sol";

import "../../../libs/math/MathHelper.sol";

contract ERC721Multiplier is AbstractERC721Multiplier {
    using MathHelper for uint256;

    function mint(address to, uint256 multiplier, uint64 duration) external onlyOwner {
        _mint(to, multiplier, duration);
    }

    function changeToken(uint256 tokenId, uint256 multiplier, uint64 duration) external onlyOwner {
        _changeToken(tokenId, multiplier, duration);
    }

    function getExtraRewards(address whose, uint256 rewards) external view returns (uint256) {
        (uint256 multiplier, ) = _getCurrentMultiplier(whose);

        return rewards.ratio(multiplier, PRECISION);
    }

    function getCurrentMultiplier(
        address whose
    ) external view returns (uint256 multiplier, uint256 timeLeft) {
        return _getCurrentMultiplier(whose);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(IERC721Multiplier).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
