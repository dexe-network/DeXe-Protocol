// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../core/PriceFeed.sol";

import "../../libs/math/MathHelper.sol";

contract PriceFeedMock is PriceFeed {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;

    function exchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory,
        uint256 minAmountOut
    ) public override returns (uint256) {
        if (amountIn == 0) {
            return 0;
        }

        _grabTokens(inToken, amountIn);

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = uniswapV2Router.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            msg.sender,
            block.timestamp
        );

        return outs[outs.length - 1];
    }

    function exchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory,
        uint256 maxAmountIn
    ) public override returns (uint256) {
        if (amountOut == 0) {
            return 0;
        }

        _grabTokens(inToken, maxAmountIn);

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory ins = uniswapV2Router.swapTokensForExactTokens(
            amountOut,
            maxAmountIn,
            path,
            msg.sender,
            block.timestamp
        );

        IERC20(inToken).safeTransfer(msg.sender, maxAmountIn - ins[0]);

        return ins[0];
    }

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
