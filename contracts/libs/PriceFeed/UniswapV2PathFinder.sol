// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/core/IPriceFeed.sol";

import "../../core/PriceFeed.sol";

library UniswapV2PathFinder {
    using EnumerableSet for EnumerableSet.AddressSet;

    function _uniswapPairExists(address token0, address token1) internal view returns (bool) {
        return PriceFeed(address(this)).uniswapFactory().getPair(token0, token1) != address(0);
    }

    function _uniswapPairsExist(address[] memory path) internal view returns (bool) {
        for (uint256 i = 1; i < path.length; i++) {
            if (!_uniswapPairExists(path[i - 1], path[i])) {
                return false;
            }
        }

        return true;
    }

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

        if (_uniswapPairExists(inToken, outToken)) {
            foundPath.path = new address[](2);
            foundPath.path[0] = inToken;
            foundPath.path[1] = outToken;

            foundPath.amounts = priceFunction(amount, foundPath.path);
        }

        uint256 length = pathTokens.length();

        for (uint256 i = 0; i < length; i++) {
            address[] memory path3 = new address[](3);
            path3[0] = inToken;
            path3[1] = pathTokens.at(i);
            path3[2] = outToken;

            if (_uniswapPairsExist(path3)) {
                uint256[] memory tmpValues = priceFunction(amount, path3);

                if (foundPath.path.length == 0 || compare(tmpValues, foundPath.amounts)) {
                    foundPath.amounts = tmpValues;
                    foundPath.path = path3;
                }
            }
        }

        if (
            providedPath.length >= 3 &&
            providedPath[0] == inToken &&
            providedPath[providedPath.length - 1] == outToken &&
            _uniswapPairsExist(providedPath)
        ) {
            uint256[] memory tmpValues = priceFunction(amount, providedPath);

            if (foundPath.path.length == 0 || compare(tmpValues, foundPath.amounts)) {
                foundPath.amounts = tmpValues;
                foundPath.path = providedPath;
                foundPath.withProvidedPath = true;
            }
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
