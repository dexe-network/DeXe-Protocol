// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/core/IPriceFeed.sol";
import "../../core/PriceFeed.sol";

library UniswapPathFinder {
    using EnumerableSet for EnumerableSet.AddressSet;

    function getUniswapPathWithPriceOut(
        EnumerableSet.AddressSet storage pathTokens,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        IPriceFeed.SwapPath calldata providedPath
    ) external returns (IPriceFeed.SwapPath memory, uint256) {
        return _getPathWithPrice(pathTokens, amountIn, tokenIn, tokenOut, true, providedPath);
    }

    function getUniswapPathWithPriceIn(
        EnumerableSet.AddressSet storage pathTokens,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        IPriceFeed.SwapPath calldata providedPath
    ) external returns (IPriceFeed.SwapPath memory, uint256) {
        return _getPathWithPrice(pathTokens, amountOut, tokenIn, tokenOut, false, providedPath);
    }

    function _getPathWithPrice(
        EnumerableSet.AddressSet storage pathTokens,
        uint256 amount,
        address tokenIn,
        address tokenOut,
        bool exactIn,
        IPriceFeed.SwapPath calldata providedPath
    ) internal returns (IPriceFeed.SwapPath memory foundPath, uint256 bestAmount) {
        bestAmount = exactIn ? 0 : type(uint256).max;
        if (amount == 0) {
            return (foundPath, 0);
        }

        address[] memory path2 = new address[](2);
        path2[0] = tokenIn;
        path2[1] = tokenOut;

        (IPriceFeed.SwapPath memory foundPath2, uint currentAmount) = _calculatePathResults(
            amount,
            path2,
            exactIn
        );

        if (exactIn ? currentAmount > bestAmount : currentAmount < bestAmount) {
            bestAmount = currentAmount;
            foundPath = foundPath2;
        }

        uint256 length = pathTokens.length();

        for (uint256 i = 0; i < length; i++) {
            address[] memory path3 = new address[](3);
            path3[0] = tokenIn;
            path3[1] = pathTokens.at(i);
            path3[2] = tokenOut;

            IPriceFeed.SwapPath memory foundPath3;
            (foundPath3, currentAmount) = _calculatePathResults(amount, path3, exactIn);

            if (exactIn ? currentAmount > bestAmount : currentAmount < bestAmount) {
                bestAmount = currentAmount;
                foundPath = foundPath3;
            }
        }

        if (_verifyPredefinedPath(tokenIn, tokenOut, providedPath)) {
            IPriceFeed.SwapPath memory customPath;
            (customPath, currentAmount) = _calculatePredefinedPathResults(
                providedPath,
                amount,
                exactIn
            );
            if (exactIn ? currentAmount > bestAmount : currentAmount < bestAmount) {
                bestAmount = currentAmount;
                foundPath = customPath;
            }
        }

        if (!exactIn && bestAmount == type(uint256).max) {
            bestAmount = 0;
        }
        return (foundPath, bestAmount);
    }

    function _verifyPredefinedPath(
        address tokenIn,
        address tokenOut,
        IPriceFeed.SwapPath calldata providedPath
    ) internal pure returns (bool verified) {
        if (
            providedPath.path.length < 3 ||
            providedPath.path.length != providedPath.poolTypes.length + 1 ||
            providedPath.path[0] != tokenIn ||
            providedPath.path[providedPath.path.length - 1] != tokenOut
        ) {
            verified = false;
        } else {
            verified = true;
        }

        for (uint i = 0; i < providedPath.poolTypes.length; i++) {
            if (providedPath.poolTypes[i] == IPriceFeed.PoolType.None) {
                verified = false;
            }
        }
    }

    function _calculatePredefinedPathResults(
        IPriceFeed.SwapPath calldata providedPath,
        uint256 amount,
        bool exactIn
    ) internal returns (IPriceFeed.SwapPath memory, uint256) {
        IPriceFeed.SwapPath memory foundPath;

        foundPath.path = providedPath.path;
        foundPath.poolTypes = providedPath.poolTypes;

        uint256 len = providedPath.path.length;
        for (uint i = exactIn ? 1 : len - 1; exactIn ? i < len : i > 0; exactIn ? i++ : i--) {
            amount = _calculateSingleSwap(
                amount,
                foundPath.path[i - 1],
                foundPath.path[i],
                foundPath.poolTypes[i - 1],
                exactIn
            );
            if (amount == (exactIn ? 0 : type(uint256).max)) {
                return (foundPath, amount);
            }
        }

        return (foundPath, amount);
    }

    function _calculatePathResults(
        uint256 amount,
        address[] memory path,
        bool exactIn
    ) internal returns (IPriceFeed.SwapPath memory, uint256) {
        IPriceFeed.SwapPath memory foundPath;
        uint256 len = path.length;
        assert(len >= 2);

        foundPath.poolTypes = new IPriceFeed.PoolType[](len - 1);
        foundPath.path = path;

        for (uint i = exactIn ? 1 : len - 1; exactIn ? i < len : i > 0; exactIn ? i++ : i--) {
            (amount, foundPath.poolTypes[i - 1]) = _findBestHop(
                amount,
                foundPath.path[i - 1],
                foundPath.path[i],
                exactIn
            );
            if (foundPath.poolTypes[i - 1] == IPriceFeed.PoolType.None) {
                return (foundPath, exactIn ? 0 : type(uint256).max);
            }
        }

        return (foundPath, amount);
    }

    function _findBestHop(
        uint256 amount,
        address tokenIn,
        address tokenOut,
        bool exactIn
    ) internal returns (uint256 amountAfterHop, IPriceFeed.PoolType poolType) {
        (amountAfterHop, poolType) = (exactIn ? 0 : type(uint256).max, IPriceFeed.PoolType.None);
        for (uint i = 1; i < 5; i++) {
            IPriceFeed.PoolType currentPoolType = IPriceFeed.PoolType(i);
            uint256 swappedAmount = _calculateSingleSwap(
                amount,
                tokenIn,
                tokenOut,
                currentPoolType,
                exactIn
            );
            if (exactIn ? swappedAmount > amountAfterHop : swappedAmount < amountAfterHop) {
                (amountAfterHop, poolType) = (swappedAmount, currentPoolType);
            }
        }
    }

    function _calculateSingleSwap(
        uint256 amount,
        address tokenIn,
        address tokenOut,
        IPriceFeed.PoolType poolType,
        bool exactIn
    ) internal returns (uint256) {
        return
            poolType == IPriceFeed.PoolType.UniswapV2
                ? _calculateSingleSwapV2(amount, tokenIn, tokenOut, exactIn)
                : _calculateSingleSwapV3(
                    amount,
                    tokenIn,
                    tokenOut,
                    _feeByPoolType(poolType),
                    exactIn
                );
    }

    function _feeByPoolType(IPriceFeed.PoolType poolType) internal pure returns (uint24 fee) {
        if (poolType == IPriceFeed.PoolType.UniswapV3Fee10000) {
            fee = 10000;
        } else if (poolType == IPriceFeed.PoolType.UniswapV3Fee3000) {
            fee = 3000;
        } else {
            fee = 500;
        }
    }

    function _calculateSingleSwapV2(
        uint256 amount,
        address tokenIn,
        address tokenOut,
        bool exactIn
    ) internal view returns (uint256) {
        IUniswapV2Router02 router = IUniswapV2Router02(PriceFeed(address(this)).uniswapV2Router());
        function(uint256, address[] memory)
            external
            view
            returns (uint256[] memory) swapFunction = exactIn
                ? router.getAmountsOut
                : router.getAmountsIn;

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        try swapFunction(amount, path) returns (uint256[] memory amounts) {
            uint256 index = exactIn ? 1 : 0;
            return amounts[index];
        } catch {
            return exactIn ? 0 : type(uint256).max;
        }
    }

    function _calculateSingleSwapV3(
        uint256 amount,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        bool exactIn
    ) internal returns (uint256) {
        IQuoter quoter = IQuoter(PriceFeed(address(this)).uniswapV3Quoter());
        function(address, address, uint24, uint256, uint160)
            external
            returns (uint256) swapFunction = exactIn
                ? quoter.quoteExactInputSingle
                : quoter.quoteExactOutputSingle;

        try swapFunction(tokenIn, tokenOut, fee, amount, 0) returns (uint256 newAmount) {
            return newAmount;
        } catch {
            return exactIn ? 0 : type(uint256).max;
        }
    }
}
