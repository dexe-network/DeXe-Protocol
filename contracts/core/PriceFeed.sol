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

import "../libs/DecimalsConverter.sol";
import "../libs/ArrayHelper.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

contract PriceFeed is IPriceFeed, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20;
    using ArrayHelper for address[];

    IUniswapV2Factory internal _uniswapFactory;
    IUniswapV2Router02 internal _uniswapV2Router;
    address internal _usdAddress;
    address internal _dexeAddress;

    EnumerableSet.AddressSet internal _pathTokens;
    EnumerableSet.AddressSet internal _supportedBaseTokens;

    mapping(address => mapping(address => mapping(address => address[]))) internal _savedPaths; // pool => token from => token to => path

    function __PriceFeed_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry) external override dependant {
        _uniswapFactory = IUniswapV2Factory(contractsRegistry.getUniswapV2FactoryContract());
        _uniswapV2Router = IUniswapV2Router02(contractsRegistry.getUniswapV2RouterContract());
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

    function _uniswapPairExists(address token0, address token1) internal view returns (bool) {
        return _uniswapFactory.getPair(token0, token1) != address(0);
    }

    function _uniswapPairsExist(address[] memory path) internal view returns (bool) {
        for (uint256 i = 1; i < path.length; i++) {
            if (!_uniswapPairExists(path[i - 1], path[i])) {
                return false;
            }
        }

        return true;
    }

    function _getPathWithPriceIn(
        address inToken,
        address outToken,
        uint256 amount,
        address[] memory savedPath
    )
        internal
        view
        returns (
            address[] memory path,
            uint256[] memory outs,
            bool withSavedPath
        )
    {
        if (amount == 0) {
            return (new address[](0), new uint256[](0), true);
        }

        if (_uniswapPairExists(inToken, outToken)) {
            path = new address[](2);
            path[0] = inToken;
            path[1] = outToken;

            outs = _uniswapV2Router.getAmountsOut(amount, path);
        }

        address[] memory path3 = new address[](3);
        path3[0] = inToken;
        path3[2] = outToken;

        uint256[] memory tmpOuts;
        uint256 length = _pathTokens.length();

        for (uint256 i = 0; i < length; i++) {
            path3[1] = _pathTokens.at(i);

            if (_uniswapPairsExist(path3)) {
                tmpOuts = _uniswapV2Router.getAmountsOut(amount, path3);

                if (outs.length == 0 || tmpOuts[tmpOuts.length - 1] > outs[outs.length - 1]) {
                    outs = tmpOuts;
                    path = path3;
                }
            }
        }

        if (
            savedPath.length >= 2 &&
            savedPath[0] == inToken &&
            savedPath[savedPath.length - 1] == outToken &&
            _uniswapPairsExist(savedPath)
        ) {
            tmpOuts = _uniswapV2Router.getAmountsOut(amount, savedPath);

            if (outs.length == 0 || tmpOuts[tmpOuts.length - 1] > outs[outs.length - 1]) {
                outs = tmpOuts;
                path = savedPath;
                withSavedPath = true;
            }
        }
    }

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amount,
        address[] memory optionalPath
    ) public view virtual override returns (uint256) {
        if (optionalPath.length == 0) {
            optionalPath = _savedPaths[_msgSender()][inToken][outToken];
        }

        (, uint256[] memory outs, ) = _getPathWithPriceIn(inToken, outToken, amount, optionalPath);

        return outs.length > 0 ? outs[outs.length - 1] : 0;
    }

    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) public view override returns (uint256) {
        return
            getExtendedPriceIn(
                inToken,
                outToken,
                amount,
                _savedPaths[_msgSender()][inToken][outToken]
            );
    }

    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) public view virtual override returns (uint256) {
        return
            getPriceIn(inToken, outToken, amount.convertFrom18(ERC20(inToken).decimals()))
                .convertTo18(ERC20(outToken).decimals());
    }

    function getPriceInDEXE(address inToken, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        return getPriceIn(inToken, _dexeAddress, amount);
    }

    function getPriceInUSD(address inToken, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        return getPriceIn(inToken, _usdAddress, amount);
    }

    function getNormalizedPriceInUSD(address inToken, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        return getNormalizedPriceIn(inToken, _usdAddress, amount);
    }

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) public virtual override returns (uint256) {
        if (amount == 0) {
            return 0;
        }

        IERC20(inToken).safeTransferFrom(_msgSender(), address(this), amount);

        if (IERC20(inToken).allowance(address(this), address(_uniswapV2Router)) == 0) {
            IERC20(inToken).safeApprove(address(_uniswapV2Router), MAX_UINT);
        }

        (address[] memory path, , bool save) = _getPathWithPriceIn(
            inToken,
            outToken,
            amount,
            optionalPath
        );

        require(path.length > 0, "PriceFeed: unreacheable asset");

        if (save) {
            _savedPaths[_msgSender()][inToken][outToken] = optionalPath;
            _savedPaths[_msgSender()][outToken][inToken] = optionalPath.reverse();
        }

        uint256[] memory outs = _uniswapV2Router.swapExactTokensForTokens(
            amount,
            minAmountOut,
            path,
            _msgSender(),
            block.timestamp
        );

        return outs[outs.length - 1];
    }

    function normalizedExchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external virtual override returns (uint256) {
        return
            exchangeTo(
                inToken,
                outToken,
                amount.convertFrom18(ERC20(inToken).decimals()),
                optionalPath,
                minAmountOut
            ).convertTo18(ERC20(outToken).decimals());
    }

    function isSupportedBaseToken(address token) external view override returns (bool) {
        return _supportedBaseTokens.contains(token);
    }

    function isSupportedPathToken(address token) external view override returns (bool) {
        return _pathTokens.contains(token);
    }
}
