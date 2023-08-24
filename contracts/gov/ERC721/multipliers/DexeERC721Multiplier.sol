// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../../interfaces/gov/ERC721/multipliers/IDexeERC721Multiplier.sol";

import "../../../libs/math/MathHelper.sol";

import "./AbstractERC721Multiplier.sol";

contract DexeERC721Multiplier is IDexeERC721Multiplier, AbstractERC721Multiplier {
    using MathHelper for uint256;
    using Math for uint256;

    mapping(address => uint256) internal _averageBalances; // user => average balance

    event AverageBalanceChanged(address user, uint256 averageBalance);

    function mint(
        address to,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) external onlyOwner {
        _mint(to, multiplier, duration);

        _averageBalances[to] = averageBalance;

        emit AverageBalanceChanged(to, averageBalance);
    }

    function changeToken(
        uint256 tokenId,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) external onlyOwner {
        _changeToken(tokenId, multiplier, duration);

        address owner = ownerOf(tokenId);

        _averageBalances[owner] = averageBalance;

        emit AverageBalanceChanged(owner, averageBalance);
    }

    function getExtraRewards(
        address whose,
        uint256 rewards
    ) external view override returns (uint256) {
        (uint256 multiplier, ) = getCurrentMultiplier(whose, rewards);

        return rewards.ratio(multiplier, PRECISION);
    }

    function getCurrentMultiplier(
        address whose,
        uint256 rewards
    ) public view returns (uint256 multiplier, uint256 timeLeft) {
        (multiplier, timeLeft) = _getCurrentMultiplier(whose);

        uint256 averageBalance = _averageBalances[whose];

        if (multiplier == 0 || averageBalance == 0) {
            return (multiplier, timeLeft);
        }

        uint256 coeff = rewards.ratio(PRECISION, averageBalance).ratio(PRECISION, multiplier);

        if (coeff > PRECISION) {
            multiplier = multiplier.ratio(PRECISION, coeff);
        }

        multiplier = multiplier.max(PRECISION) - PRECISION;
    }
}
