// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "./ERC721Multiplier.sol";

import "hardhat/console.sol";

contract DexeERC721Multiplier is ERC721Multiplier {
    using MathHelper for uint256;
    using Math for uint256;

    mapping(address => uint256) internal _averageBalances; // user => average balance

    function __DexeERC721Multiplier_init(string calldata name, string calldata symbol) external {
        __ERC721Multiplier_init(name, symbol);
    }

    function changeToken(
        uint256 tokenId,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) public override {
        _averageBalances[ownerOf(tokenId)] = averageBalance;

        super.changeToken(tokenId, multiplier, duration, averageBalance);
    }

    function mint(
        address to,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) public override {
        _averageBalances[to] = averageBalance;

        super.mint(to, multiplier, duration, averageBalance);
    }

    function getCurrentMultiplier(
        address whose,
        uint256 rewards
    ) public view override returns (uint256 multiplier, uint256 timeLeft) {
        (multiplier, timeLeft) = super.getCurrentMultiplier(whose, rewards);

        uint256 averageBalance = _averageBalances[whose];

        if (multiplier == 0 || averageBalance == 0) {
            return (multiplier, timeLeft);
        }

        uint256 coeff = rewards.ratio(PRECISION * PRECISION, averageBalance * multiplier);

        if (coeff > PRECISION) {
            multiplier = multiplier.ratio(PRECISION, coeff).max(PRECISION);
        }
    }
}
