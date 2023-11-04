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
        SwapPath memory
    ) public override returns (uint256, SwapPath memory) {
        if (amountIn == 0) {
            return (0, _getEmptySwapPath());
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = uniswapV2Router.getAmountsOut(amountIn, path);

        return (outs[outs.length - 1], _transformToSwapPath(path));
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        SwapPath memory
    ) public override returns (uint256, SwapPath memory) {
        if (amountOut == 0) {
            return (0, _getEmptySwapPath());
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory ins = uniswapV2Router.getAmountsIn(amountOut, path);

        return (ins[0], _transformToSwapPath(path));
    }

    function _transformToSwapPath(
        address[] memory path
    ) internal returns (SwapPath memory fullPath) {
        fullPath.path = path;
        uint8[] memory poolTypes = new uint8[](1);
        poolTypes[0] = 0;
        fullPath.poolTypes = poolTypes;
    }
}
