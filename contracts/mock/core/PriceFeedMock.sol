// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../core/PriceFeed.sol";

import "../../libs/MathHelper.sol";

contract PriceFeedMock is PriceFeed {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;

    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) public view override returns (uint256) {
        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = _uniswapV2Router.getAmountsOut(amount, path);

        return outs[outs.length - 1];
    }

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external override returns (uint256) {
        if (amount == 0) {
            return 0;
        }

        IERC20(inToken).safeTransferFrom(_msgSender(), address(this), amount);

        if (IERC20(inToken).allowance(address(this), address(_uniswapV2Router)) == 0) {
            IERC20(inToken).safeApprove(address(_uniswapV2Router), MAX_UINT);
        }

        address[] memory path = new address[](2);

        path[0] = inToken;
        path[1] = outToken;

        uint256[] memory outs = _uniswapV2Router.swapExactTokensForTokens(
            amount,
            0,
            path,
            _msgSender(),
            block.timestamp + 1
        );

        return outs[outs.length - 1];
    }
}
