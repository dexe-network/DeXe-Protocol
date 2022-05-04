// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/core/IPriceFeed.sol";

import "../../core/PriceFeed.sol";

library UniswapV2PathFinder {
    using EnumerableSet for EnumerableSet.AddressSet;

    function _uniswapLess(uint256[] memory first, uint256[] memory second)
        internal
        pure
        returns (bool)
    {
        return first[0] < second[0];
    }

    function _uniswapMore(uint256[] memory first, uint256[] memory second)
        internal
        pure
        returns (bool)
    {
        return first[first.length - 1] > second[second.length - 1];
    }

    function _getPathWithPrice(
        EnumerableSet.AddressSet storage pathTokens,
        address inToken,
        address outToken,
        uint256 amount,
        function(uint256, address[] memory) external view returns (uint256[] memory) priceFunction,
        function(uint256[] memory, uint256[] memory) internal pure returns (bool) compare,
        address[] calldata providedPath
    ) internal view returns (IPriceFeed.FoundPath memory foundPath) {
        if (amount == 0) {
            return IPriceFeed.FoundPath(new address[](0), new uint256[](0), true);
        }

        address[] memory path2 = new address[](2);
        path2[0] = inToken;
        path2[1] = outToken;

        try priceFunction(amount, path2) returns (uint256[] memory amounts) {
            foundPath.amounts = amounts;
            foundPath.path = path2;
        } catch {}

        uint256 length = pathTokens.length();

        for (uint256 i = 0; i < length; i++) {
            address[] memory path3 = new address[](3);
            path3[0] = inToken;
            path3[1] = pathTokens.at(i);
            path3[2] = outToken;

            try priceFunction(amount, path3) returns (uint256[] memory amounts) {
                if (foundPath.path.length == 0 || compare(amounts, foundPath.amounts)) {
                    foundPath.amounts = amounts;
                    foundPath.path = path3;
                }
            } catch {}
        }

        if (
            providedPath.length >= 3 &&
            providedPath[0] == inToken &&
            providedPath[providedPath.length - 1] == outToken
        ) {
            try priceFunction(amount, providedPath) returns (uint256[] memory amounts) {
                if (foundPath.path.length == 0 || compare(amounts, foundPath.amounts)) {
                    foundPath.amounts = amounts;
                    foundPath.path = providedPath;
                    foundPath.withProvidedPath = true;
                }
            } catch {}
        }
    }

    function getUniV2PathWithPriceOut(
        EnumerableSet.AddressSet storage pathTokens,
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata providedPath
    ) external view returns (IPriceFeed.FoundPath memory foundPath) {
        return
            _getPathWithPrice(
                pathTokens,
                inToken,
                outToken,
                amountIn,
                PriceFeed(address(this)).uniswapV2Router().getAmountsOut,
                _uniswapMore,
                providedPath
            );
    }

    function getUniV2PathWithPriceIn(
        EnumerableSet.AddressSet storage pathTokens,
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata providedPath
    ) external view returns (IPriceFeed.FoundPath memory foundPath) {
        return
            _getPathWithPrice(
                pathTokens,
                inToken,
                outToken,
                amountOut,
                PriceFeed(address(this)).uniswapV2Router().getAmountsIn,
                _uniswapLess,
                providedPath
            );
    }
}
