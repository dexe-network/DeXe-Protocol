// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

contract PriceFeed is IPriceFeed, OwnableUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;

    IUniswapV2Router02 internal _uniswapV2Router;
    address internal _daiAddress;

    EnumerableSet.AddressSet internal _pathTokens;
    EnumerableSet.AddressSet internal _supportedBaseTokens;

    function __PriceFeed_init_() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _uniswapV2Router = IUniswapV2Router02(contractsRegistry.getUniswapV2RounterContract());
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
        uint256 amount,
        address inToken,
        address outToken
    ) public view override returns (uint256) {
        // TODO
    }

    function getPriceInDAI(uint256 amount, address inToken)
        external
        view
        override
        returns (uint256)
    {
        return getPriceIn(amount, inToken, _daiAddress);
    }

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external override returns (uint256) {
        // TODO
    }
}
