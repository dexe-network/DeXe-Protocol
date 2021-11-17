// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/DecimalsConverter.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

contract PriceFeed is IPriceFeed, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;

    IUniswapV2Router02 internal _uniswapV2Router;
    address internal _daiAddress;

    EnumerableSet.AddressSet internal _pathTokens;
    EnumerableSet.AddressSet internal _supportedBaseTokens;

    function __PriceFeed_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _uniswapV2Router = IUniswapV2Router02(contractsRegistry.getUniswapV2RouterContract());
        _daiAddress = contractsRegistry.getDAIContract();
    }

    function _insertInto(EnumerableSet.AddressSet storage addressSet, address[] memory array)
        private
    {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.add(array[i]);
        }
    }

    function _removeFrom(EnumerableSet.AddressSet storage addressSet, address[] memory array)
        private
    {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.remove(array[i]);
        }
    }

    /// @notice this function sets path tokens that are used throughout the platform to calculate prices
    function setPathTokens(address[] calldata pathTokens) external onlyOwner {
        _insertInto(_pathTokens, pathTokens);
    }

    function removePathTokens(address[] calldata pathTokens) external onlyOwner {
        _removeFrom(_pathTokens, pathTokens);
    }

    function addSupportedBaseTokens(address[] calldata baseTokens) external onlyOwner {
        _insertInto(_supportedBaseTokens, baseTokens);
    }

    function removeSupportedBaseTokens(address[] calldata baseTokens) external onlyOwner {
        _removeFrom(_supportedBaseTokens, baseTokens);
    }

    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) public view virtual override returns (uint256) {
        // TODO
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

    function getPriceInDAI(address inToken, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        return getPriceIn(inToken, _daiAddress, amount);
    }

    function getNormalizedPriceInDAI(address inToken, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        return getNormalizedPriceIn(inToken, _daiAddress, amount);
    }

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) public virtual override returns (uint256) {
        // TODO
    }

    function normalizedExchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external virtual override returns (uint256) {
        return
            exchangeTo(inToken, outToken, amount.convertFrom18(ERC20(inToken).decimals()))
                .convertTo18(ERC20(outToken).decimals());
    }

    function isSupportedBaseToken(address token) external view override returns (bool) {
        return _supportedBaseTokens.contains(token);
    }
}
