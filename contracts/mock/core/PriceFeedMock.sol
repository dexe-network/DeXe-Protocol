// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../core/PriceFeed.sol";

import "../../libs/math/MathHelper.sol";

contract PriceFeedMock is PriceFeed {
    using MathHelper for uint256;

    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory
    ) public view override returns (uint256, address[] memory) {
        if (amountIn == 0) {
            return (0, new address[](0));
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = uniswapV2Router.getAmountsOut(amountIn, path);

        return (outs[outs.length - 1], path);
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory
    ) public view override returns (uint256, address[] memory) {
        if (amountOut == 0) {
            return (0, new address[](0));
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory ins = uniswapV2Router.getAmountsIn(amountOut, path);

        return (ins[0], path);
    }
}
