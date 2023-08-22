// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "./ERC721Multiplier.sol";

contract DexeERC721Multiplier is ERC721Multiplier {
    using MathHelper for uint256;
    using Math for uint256;

    event AverageBalanceChanged(address user, uint256 averageBalance);

    mapping(address => uint256) internal _averageBalances; // user => average balance

    function __DexeERC721Multiplier_init(string calldata name, string calldata symbol) external {
        __ERC721Multiplier_init(name, symbol);
    }

    function mintWithAverageBalance(
        address to,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) external {
        super.mint(to, multiplier, duration);

        _averageBalances[to] = averageBalance;

        emit AverageBalanceChanged(to, averageBalance);
    }

    function changeTokenWithAverageBalance(
        uint256 tokenId,
        uint256 multiplier,
        uint64 duration,
        uint256 averageBalance
    ) external {
        super.changeToken(tokenId, multiplier, duration);

        address owner = ownerOf(tokenId);

        _averageBalances[owner] = averageBalance;

        emit AverageBalanceChanged(owner, averageBalance);
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

        uint256 coeff = rewards.ratio(PRECISION, averageBalance).ratio(PRECISION, multiplier);

        if (coeff > PRECISION) {
            multiplier = multiplier.ratio(PRECISION, coeff).max(PRECISION) - PRECISION;
        }
    }
}
