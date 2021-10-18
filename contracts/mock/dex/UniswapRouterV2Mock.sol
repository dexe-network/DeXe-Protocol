// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract UniswapRouterMock {
    mapping(address => uint256) public reserves;

    function setReserve(address token, uint256 amount) external {
        require(amount <= (10**15) * 1 ether, "UniswapRouterMock: can't set that amount");

        reserves[token] = amount;
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

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
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
}
