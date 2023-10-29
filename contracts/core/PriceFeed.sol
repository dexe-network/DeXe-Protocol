// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@solarity/solidity-lib/contracts-registry/AbstractDependant.sol";
import "@solarity/solidity-lib/libs/arrays/SetHelper.sol";
import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/price-feed/UniswapPathFinder.sol";

import "../core/Globals.sol";

contract PriceFeed is IPriceFeed, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for *;
    using SetHelper for EnumerableSet.AddressSet;
    using UniswapPathFinder for EnumerableSet.AddressSet;

    IUniswapV2Factory public uniswapFactory;
    IUniswapV2Router02 public uniswapV2Router;
    IQuoter public uniswapV3Quoter;
    address internal _usdAddress;
    address internal _dexeAddress;

    EnumerableSet.AddressSet internal _pathTokens;

    function __PriceFeed_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(
        address contractsRegistry,
        bytes memory
    ) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        uniswapFactory = IUniswapV2Factory(registry.getUniswapV2FactoryContract());
        uniswapV2Router = IUniswapV2Router02(registry.getUniswapV2RouterContract());
        uniswapV3Quoter = IQuoter(registry.getUniswapV3QuoterContract());
        _usdAddress = registry.getUSDContract();
        _dexeAddress = registry.getDEXEContract();
    }

    function addPathTokens(address[] calldata pathTokens) external override onlyOwner {
        _pathTokens.add(pathTokens);
    }

    function removePathTokens(address[] calldata pathTokens) external override onlyOwner {
        _pathTokens.remove(pathTokens);
    }

    function getPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn
    ) external override returns (uint256 amountOut, SwapPath memory path) {
        return getExtendedPriceOut(inToken, outToken, amountIn, _getEmptySwapPath());
    }

    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut
    ) external override returns (uint256 amountIn, SwapPath memory path) {
        return getExtendedPriceIn(inToken, outToken, amountOut, _getEmptySwapPath());
    }

    function getNormalizedPriceOutUSD(
        address inToken,
        uint256 amountIn
    ) external override returns (uint256 amountOut, SwapPath memory path) {
        return getNormalizedPriceOut(inToken, _usdAddress, amountIn);
    }

    function getNormalizedPriceInUSD(
        address inToken,
        uint256 amountOut
    ) external override returns (uint256 amountIn, SwapPath memory path) {
        return getNormalizedPriceIn(inToken, _usdAddress, amountOut);
    }

    function getNormalizedPriceOutDEXE(
        address inToken,
        uint256 amountIn
    ) external override returns (uint256 amountOut, SwapPath memory path) {
        return getNormalizedPriceOut(inToken, _dexeAddress, amountIn);
    }

    function getNormalizedPriceInDEXE(
        address inToken,
        uint256 amountOut
    ) external override returns (uint256 amountIn, SwapPath memory path) {
        return getNormalizedPriceIn(inToken, _dexeAddress, amountOut);
    }

    function totalPathTokens() external view override returns (uint256) {
        return _pathTokens.length();
    }

    function getPathTokens() external view override returns (address[] memory) {
        return _pathTokens.values();
    }

    function isSupportedPathToken(address token) external view override returns (bool) {
        return _pathTokens.contains(token);
    }

    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        SwapPath memory optionalPath
    ) public virtual override returns (uint256 amountOut, SwapPath memory path) {
        if (inToken == outToken) {
            return (amountIn, _getEmptySwapPath());
        }

        FoundPath memory foundPath = _pathTokens.getUniswapPathWithPriceOut(
            inToken,
            outToken,
            amountIn,
            optionalPath
        );

        return
            foundPath.amounts.length > 0
                ? (
                    foundPath.amounts[foundPath.amounts.length - 1],
                    SwapPath(foundPath.path, foundPath.poolTypes)
                )
                : (0, _getEmptySwapPath());
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        SwapPath memory optionalPath
    ) public virtual override returns (uint256 amountIn, SwapPath memory path) {
        if (inToken == outToken) {
            return (amountOut, _getEmptySwapPath());
        }

        FoundPath memory foundPath = _pathTokens.getUniswapPathWithPriceIn(
            inToken,
            outToken,
            amountOut,
            optionalPath
        );

        return
            foundPath.amounts.length > 0
                ? (foundPath.amounts[0], SwapPath(foundPath.path, foundPath.poolTypes))
                : (0, _getEmptySwapPath());
    }

    function getNormalizedExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        SwapPath memory optionalPath
    ) public override returns (uint256 amountOut, SwapPath memory path) {
        (amountOut, path) = getExtendedPriceOut(
            inToken,
            outToken,
            amountIn.from18(inToken.decimals()),
            optionalPath
        );

        amountOut = amountOut.to18(outToken.decimals());
    }

    function getNormalizedExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        SwapPath memory optionalPath
    ) public override returns (uint256 amountIn, SwapPath memory path) {
        (amountIn, path) = getExtendedPriceIn(
            inToken,
            outToken,
            amountOut.from18(outToken.decimals()),
            optionalPath
        );

        amountIn = amountIn.to18(inToken.decimals());
    }

    function getNormalizedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn
    ) public override returns (uint256 amountOut, SwapPath memory path) {
        return getNormalizedExtendedPriceOut(inToken, outToken, amountIn, _getEmptySwapPath());
    }

    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut
    ) public override returns (uint256 amountIn, SwapPath memory path) {
        return getNormalizedExtendedPriceIn(inToken, outToken, amountOut, _getEmptySwapPath());
    }

    function _getEmptySwapPath() internal pure returns (SwapPath memory path) {}
}
