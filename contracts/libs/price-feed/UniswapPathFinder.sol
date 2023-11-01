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
        IPriceFeed.SwapPath memory providedPath
    ) external returns (IPriceFeed.FoundPath memory foundPath) {
        return _getPathWithPrice(pathTokens, amountIn, tokenIn, tokenOut, true, providedPath);
    }

    function getUniswapPathWithPriceIn(
        EnumerableSet.AddressSet storage pathTokens,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        IPriceFeed.SwapPath memory providedPath
    ) external returns (IPriceFeed.FoundPath memory foundPath) {
        return _getPathWithPrice(pathTokens, amountOut, tokenIn, tokenOut, false, providedPath);
    }

    // TODO: Switch provided path memory to calldata
    function _getPathWithPrice(
        EnumerableSet.AddressSet storage pathTokens,
        uint256 amount,
        address tokenIn,
        address tokenOut,
        bool exactIn,
        IPriceFeed.SwapPath memory providedPath
    ) internal returns (IPriceFeed.FoundPath memory foundPath) {
        if (amount == 0) {
            return foundPath;
        }

        address[] memory path2 = new address[](2);
        path2[0] = tokenIn;
        path2[1] = tokenOut;

        (
            IPriceFeed.FoundPath memory foundPath2,
            bool isFoundAtLeastOnePath
        ) = _calculatePathResults(amount, path2, exactIn);

        if (isFoundAtLeastOnePath) {
            foundPath = foundPath2;
        }

        uint256 length = pathTokens.length();

        for (uint256 i = 0; i < length; i++) {
            address[] memory path3 = new address[](3);
            path3[0] = tokenIn;
            path3[1] = pathTokens.at(i);
            path3[2] = tokenOut;

            (IPriceFeed.FoundPath memory foundPath3, bool isPathValid) = _calculatePathResults(
                amount,
                path3,
                exactIn
            );

            if (isPathValid) {
                if (!isFoundAtLeastOnePath) {
                    isFoundAtLeastOnePath = true;
                    foundPath = foundPath3;
                } else {
                    if (_comparePathResults(foundPath, foundPath3, exactIn)) {
                        foundPath = foundPath3;
                    }
                }
            }
        }

        if (_verifyPredefinedPath(tokenIn, tokenOut, providedPath)) {
            (
                IPriceFeed.FoundPath memory customPath,
                bool isPathValid
            ) = _calculatePredefinedPathResults(providedPath, amount, exactIn);
            if (isPathValid) {
                if (!isFoundAtLeastOnePath) {
                    isFoundAtLeastOnePath = true;
                    foundPath = customPath;
                } else {
                    if (_comparePathResults(foundPath, customPath, exactIn)) {
                        foundPath = customPath;
                    }
                }
            }
        }
    }

    function _comparePathResults(
        IPriceFeed.FoundPath memory oldPath,
        IPriceFeed.FoundPath memory newPath,
        bool exactIn
    ) internal pure returns (bool) {
        uint256 oldAmount = exactIn
            ? oldPath.amounts[oldPath.amounts.length - 1]
            : oldPath.amounts[0];
        uint256 newAmount = exactIn
            ? newPath.amounts[newPath.amounts.length - 1]
            : newPath.amounts[0];

        return exactIn ? oldAmount < newAmount : oldAmount > newAmount;
    }

    // TODO: Switch provided path memory to calldata
    function _verifyPredefinedPath(
        address tokenIn,
        address tokenOut,
        IPriceFeed.SwapPath memory providedPath
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

    // TODO: Switch provided path memory to calldata
    function _calculatePredefinedPathResults(
        IPriceFeed.SwapPath memory providedPath,
        uint256 amount,
        bool exactIn
    ) internal returns (IPriceFeed.FoundPath memory foundPath, bool isPathValid) {
        isPathValid = true;
        uint256 len = providedPath.path.length;
        uint256[] memory amounts = new uint256[](len);
        foundPath.path = providedPath.path;
        foundPath.poolTypes = providedPath.poolTypes;
        foundPath.amounts = amounts;

        if (exactIn) {
            amounts[0] = amount;
            for (uint i = 0; i < len - 1; i++) {
                amounts[i + 1] = _calculateSingleSwap(
                    amounts[i],
                    foundPath.path[i],
                    foundPath.path[i + 1],
                    foundPath.poolTypes[i],
                    true
                );
                if (amounts[i + 1] == 0) {
                    return (foundPath, false);
                }
            }
        } else {
            amounts[len - 1] = amount;
            for (uint i = len - 1; i > 0; i--) {
                amounts[i - 1] = _calculateSingleSwap(
                    amounts[i],
                    foundPath.path[i - 1],
                    foundPath.path[i],
                    foundPath.poolTypes[i - 1],
                    false
                );
                if (amounts[i - 1] == type(uint256).max) {
                    return (foundPath, false);
                }
            }
        }
    }

    function _calculatePathResults(
        uint256 amount,
        address[] memory path,
        bool exactIn
    ) internal returns (IPriceFeed.FoundPath memory foundPath, bool isPathValid) {
        isPathValid = true;
        uint256 len = path.length;
        assert(len >= 2);

        foundPath.amounts = new uint256[](len);
        foundPath.poolTypes = new IPriceFeed.PoolType[](len - 1);
        foundPath.path = path;

        if (exactIn) {
            foundPath.amounts[0] = amount;
            for (uint i = 0; i < len - 1; i++) {
                (foundPath.amounts[i + 1], foundPath.poolTypes[i]) = _findBestHop(
                    foundPath.amounts[i],
                    path[i],
                    path[i + 1],
                    true
                );
                if (foundPath.poolTypes[i] == IPriceFeed.PoolType.None) {
                    return (foundPath, false);
                }
            }
        } else {
            foundPath.amounts[len - 1] = amount;
            for (uint i = len - 1; i > 0; i--) {
                (foundPath.amounts[i - 1], foundPath.poolTypes[i - 1]) = _findBestHop(
                    foundPath.amounts[i],
                    path[i - 1],
                    path[i],
                    false
                );
                if (foundPath.poolTypes[i - 1] == IPriceFeed.PoolType.None) {
                    return (foundPath, false);
                }
            }
        }
    }

    function _findBestHop(
        uint256 amount,
        address tokenIn,
        address tokenOut,
        bool exactIn
    ) internal returns (uint256 amountAfterHop, IPriceFeed.PoolType poolType) {
        (amountAfterHop, poolType) = (exactIn ? 0 : type(uint256).max, IPriceFeed.PoolType.None);
        uint256 swappedAmount = _calculateSingleSwapV2(amount, tokenIn, tokenOut, exactIn);
        if (exactIn ? swappedAmount > amountAfterHop : swappedAmount < amountAfterHop) {
            (amountAfterHop, poolType) = (swappedAmount, IPriceFeed.PoolType.UniswapV2);
        }
        for (uint i = 2; i < 5; i++) {
            IPriceFeed.PoolType v3PoolType = IPriceFeed.PoolType(i);
            swappedAmount = _calculateSingleSwapV3(
                amount,
                tokenIn,
                tokenOut,
                _feeByPoolType(v3PoolType),
                exactIn
            );
            if (exactIn ? swappedAmount > amountAfterHop : swappedAmount < amountAfterHop) {
                (amountAfterHop, poolType) = (swappedAmount, v3PoolType);
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
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        if (exactIn) {
            try router.getAmountsOut(amount, path) returns (uint256[] memory amounts) {
                return amounts[1];
            } catch {
                return 0;
            }
        } else {
            try router.getAmountsIn(amount, path) returns (uint256[] memory amounts) {
                return amounts[0];
            } catch {
                return type(uint256).max;
            }
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

        if (exactIn) {
            try quoter.quoteExactInputSingle(tokenIn, tokenOut, fee, amount, 0) returns (
                uint256 newAmount
            ) {
                return newAmount;
            } catch {
                return 0;
            }
        } else {
            try quoter.quoteExactOutputSingle(tokenIn, tokenOut, fee, amount, 0) returns (
                uint256 newAmount
            ) {
                return newAmount;
            } catch {
                return type(uint256).max;
            }
        }
    }
}
