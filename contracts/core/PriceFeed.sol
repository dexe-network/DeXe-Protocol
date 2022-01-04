// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/PriceFeed/UniswapV2PathFinder.sol";
import "../libs/DecimalsConverter.sol";
import "../libs/ArrayHelper.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

contract PriceFeed is IPriceFeed, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20;
    using ArrayHelper for address[];
    using UniswapV2PathFinder for EnumerableSet.AddressSet;

    IUniswapV2Factory public uniswapFactory;
    IUniswapV2Router02 public uniswapV2Router;
    address internal _usdAddress;
    address internal _dexeAddress;

    EnumerableSet.AddressSet internal _pathTokens;
    EnumerableSet.AddressSet internal _supportedBaseTokens;

    mapping(address => mapping(address => mapping(address => address[]))) internal _savedPaths; // pool => token from => token to => path

    function __PriceFeed_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        uniswapFactory = IUniswapV2Factory(contractsRegistry.getUniswapV2FactoryContract());
        uniswapV2Router = IUniswapV2Router02(contractsRegistry.getUniswapV2RouterContract());
        _usdAddress = contractsRegistry.getUSDContract();
        _dexeAddress = contractsRegistry.getDEXEContract();
    }

    function _insertInto(EnumerableSet.AddressSet storage addressSet, address[] calldata array)
        private
    {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.add(array[i]);
        }
    }

    function _removeFrom(EnumerableSet.AddressSet storage addressSet, address[] calldata array)
        private
    {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.remove(array[i]);
        }
    }

    /// @notice this function sets path tokens that are used throughout the platform to calculate prices
    function setPathTokens(address[] calldata pathTokens) external override onlyOwner {
        _insertInto(_pathTokens, pathTokens);
    }

    function removePathTokens(address[] calldata pathTokens) external override onlyOwner {
        _removeFrom(_pathTokens, pathTokens);
    }

    function addSupportedBaseTokens(address[] calldata baseTokens) external override onlyOwner {
        _insertInto(_supportedBaseTokens, baseTokens);
    }

    function removeSupportedBaseTokens(address[] calldata baseTokens) external override onlyOwner {
        _removeFrom(_supportedBaseTokens, baseTokens);
    }

    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) public view virtual override returns (uint256) {
        if (inToken == outToken) {
            return amountIn;
        }

        if (optionalPath.length == 0) {
            optionalPath = _savedPaths[_msgSender()][inToken][outToken];
        }

        FoundPath memory foundPath = _pathTokens.getUniV2PathWithPriceOut(
            inToken,
            outToken,
            amountIn,
            optionalPath
        );

        return foundPath.amounts.length > 0 ? foundPath.amounts[foundPath.amounts.length - 1] : 0;
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) public view virtual override returns (uint256) {
        if (inToken == outToken) {
            return amountOut;
        }

        if (optionalPath.length == 0) {
            optionalPath = _savedPaths[_msgSender()][inToken][outToken];
        }

        FoundPath memory foundPath = _pathTokens.getUniV2PathWithPriceIn(
            inToken,
            outToken,
            amountOut,
            optionalPath
        );

        return foundPath.amounts.length > 0 ? foundPath.amounts[0] : 0;
    }

    function getNormalizedExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) public view virtual override returns (uint256) {
        return
            getExtendedPriceOut(
                inToken,
                outToken,
                amountIn.convertFrom18(ERC20(inToken).decimals()),
                optionalPath
            ).convertTo18(ERC20(outToken).decimals());
    }

    function getNormalizedExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) public view virtual override returns (uint256) {
        return
            getExtendedPriceIn(
                inToken,
                outToken,
                amountOut.convertFrom18(ERC20(outToken).decimals()),
                optionalPath
            ).convertTo18(ERC20(inToken).decimals());
    }

    function getNormalizedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn
    ) public view virtual override returns (uint256) {
        return
            getExtendedPriceOut(
                inToken,
                outToken,
                amountIn.convertFrom18(ERC20(inToken).decimals()),
                _savedPaths[_msgSender()][inToken][outToken]
            ).convertTo18(ERC20(outToken).decimals());
    }

    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut
    ) public view virtual override returns (uint256) {
        return
            getExtendedPriceIn(
                inToken,
                outToken,
                amountOut.convertFrom18(ERC20(outToken).decimals()),
                _savedPaths[_msgSender()][inToken][outToken]
            ).convertTo18(ERC20(inToken).decimals());
    }

    function getNormalizedPriceOutDEXE(address inToken, uint256 amountIn)
        external
        view
        override
        returns (uint256)
    {
        return getNormalizedPriceOut(inToken, _dexeAddress, amountIn);
    }

    function getNormalizedPriceOutUSD(address inToken, uint256 amountIn)
        external
        view
        override
        returns (uint256)
    {
        return getNormalizedPriceOut(inToken, _usdAddress, amountIn);
    }

    function getNormalizedPriceOutBase(address outToken, uint256 amountInUSD)
        external
        view
        override
        returns (uint256)
    {
        return getNormalizedPriceOut(_usdAddress, outToken, amountInUSD);
    }

    function _savePath(
        address inToken,
        address outToken,
        address[] memory path,
        bool save
    ) internal {
        require(path.length > 0, "PriceFeed: unreacheable asset");

        if (save) {
            _savedPaths[_msgSender()][inToken][outToken] = path;
            _savedPaths[_msgSender()][outToken][inToken] = path.reverse();
        }
    }

    function _grabTokens(address token, uint256 amount) internal {
        IERC20(token).safeTransferFrom(_msgSender(), address(this), amount);

        if (IERC20(token).allowance(address(this), address(uniswapV2Router)) == 0) {
            IERC20(token).safeApprove(address(uniswapV2Router), MAX_UINT);
        }
    }

    function exchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) public virtual override returns (uint256) {
        if (amountIn == 0) {
            return 0;
        }

        if (inToken == outToken) {
            return amountIn;
        }

        FoundPath memory foundPath = _pathTokens.getUniV2PathWithPriceOut(
            inToken,
            outToken,
            amountIn,
            optionalPath
        );

        _savePath(inToken, outToken, foundPath.path, foundPath.withSavedPath);
        _grabTokens(inToken, amountIn);

        uint256[] memory outs = uniswapV2Router.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            foundPath.path,
            _msgSender(),
            block.timestamp
        );

        return outs[outs.length - 1];
    }

    function exchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) public virtual override returns (uint256) {
        if (amountOut == 0) {
            return 0;
        }

        if (inToken == outToken) {
            return amountOut;
        }

        FoundPath memory foundPath = _pathTokens.getUniV2PathWithPriceIn(
            inToken,
            outToken,
            amountOut,
            optionalPath
        );

        _savePath(inToken, outToken, foundPath.path, foundPath.withSavedPath);
        _grabTokens(inToken, maxAmountIn);

        uint256[] memory ins = uniswapV2Router.swapTokensForExactTokens(
            amountOut,
            maxAmountIn,
            foundPath.path,
            _msgSender(),
            block.timestamp
        );

        IERC20(inToken).safeTransfer(_msgSender(), maxAmountIn - ins[0]);

        return ins[0];
    }

    function normalizedExchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external virtual override returns (uint256) {
        uint256 outDecimals = ERC20(outToken).decimals();

        return
            exchangeFromExact(
                inToken,
                outToken,
                amountIn.convertFrom18(ERC20(inToken).decimals()),
                optionalPath,
                minAmountOut.convertFrom18(outDecimals)
            ).convertTo18(outDecimals);
    }

    function normalizedExchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) external virtual override returns (uint256) {
        uint256 inDecimals = ERC20(inToken).decimals();

        return
            exchangeToExact(
                inToken,
                outToken,
                amountOut.convertFrom18(ERC20(outToken).decimals()),
                optionalPath,
                maxAmountIn.convertFrom18(inDecimals)
            ).convertTo18(inDecimals);
    }

    function isSupportedBaseToken(address token) external view override returns (bool) {
        return _supportedBaseTokens.contains(token);
    }

    function isSupportedPathToken(address token) external view override returns (bool) {
        return _pathTokens.contains(token);
    }
}
