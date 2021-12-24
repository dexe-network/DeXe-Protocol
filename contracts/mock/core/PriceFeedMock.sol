// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../core/PriceFeed.sol";

import "../../libs/MathHelper.sol";

contract PriceFeedMock is PriceFeed {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;

    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) public view override returns (uint256) {
        if (amountIn == 0) {
            return 0;
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = uniswapV2Router.getAmountsOut(amountIn, path);

        return outs[outs.length - 1];
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) public view override returns (uint256) {
        if (amountOut == 0) {
            return 0;
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory ins = uniswapV2Router.getAmountsIn(amountOut, path);

        return ins[0];
    }

    function exchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
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
            _msgSender(),
            block.timestamp
        );

        return outs[outs.length - 1];
    }

    function exchangeToExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
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
            _msgSender(),
            block.timestamp
        );

        return outs[outs.length - 1];
    }
}
