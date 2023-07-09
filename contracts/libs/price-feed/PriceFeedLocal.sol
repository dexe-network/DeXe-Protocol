// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/core/IPriceFeed.sol";

import "../../core/Globals.sol";

library PriceFeedLocal {
    using SafeERC20 for IERC20;

    function checkAllowance(IPriceFeed priceFeed, address tokenAddress) internal {
        IERC20 token = IERC20(tokenAddress);
        address priceFeedAddress = address(priceFeed);

        if (token.allowance(address(this), priceFeedAddress) == 0) {
            token.safeApprove(priceFeedAddress, MAX_UINT);
        }
    }

    function normExchangeFromExact(
        IPriceFeed priceFeed,
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath,
        uint256 minAmountOut
    ) internal returns (uint256) {
        return
            priceFeed.normalizedExchangeFromExact(
                inToken,
                outToken,
                amountIn,
                optionalPath,
                minAmountOut
            );
    }

    function normExchangeToExact(
        IPriceFeed priceFeed,
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath,
        uint256 maxAmountIn
    ) internal returns (uint256) {
        return
            priceFeed.normalizedExchangeToExact(
                inToken,
                outToken,
                amountOut,
                optionalPath,
                maxAmountIn
            );
    }

    function getNormPriceOut(
        IPriceFeed priceFeed,
        address inToken,
        address outToken,
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        (amountOut, ) = priceFeed.getNormalizedPriceOut(inToken, outToken, amountIn);
    }

    function getNormPriceIn(
        IPriceFeed priceFeed,
        address inToken,
        address outToken,
        uint256 amountOut
    ) internal view returns (uint256 amountIn) {
        (amountIn, ) = priceFeed.getNormalizedPriceIn(inToken, outToken, amountOut);
    }
}
