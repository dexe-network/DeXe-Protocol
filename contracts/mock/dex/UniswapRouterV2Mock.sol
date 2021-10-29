// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract UniswapRouterV2Mock {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public reserves;

    function setReserve(address token, uint256 amount) external {
        uint256 balance = IERC20(token).balanceOf(address(this));

        reserves[token] = amount;

        if (amount > balance) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount - balance);
        } else if (amount < balance) {
            IERC20(token).safeTransfer(msg.sender, balance - amount);
        }
    }

    function _getReserves(address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        return (reserves[tokenA], reserves[tokenB]);
    }

    /// @dev modified formula for simplicity
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");

        amountOut = (amountIn * reserveOut) / reserveIn;
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "UniswapV2Library: INVALID_PATH");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = _getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            reserves[path[i]] = IERC20(path[i]).balanceOf(address(this));
        }

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amounts[0]);
        IERC20(path[path.length - 1]).safeTransfer(_to, amounts[amounts.length - 1]);

        reserves[path[path.length - 1]] = IERC20(path[path.length - 1]).balanceOf(address(this));
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);

        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
        );

        _swap(amounts, path, to);
    }
}
