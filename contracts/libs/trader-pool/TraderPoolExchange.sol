// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "../price-feed/PriceFeedLocal.sol";
import "../utils/TokenBalance.sol";

library TraderPoolExchange {
    using EnumerableSet for EnumerableSet.AddressSet;
    using PriceFeedLocal for IPriceFeed;
    using TokenBalance for address;

    event Exchanged(
        address sender,
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );
    event PositionClosed(address position);

    function exchange(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage positions,
        address from,
        address to,
        uint256 amount,
        uint256 amountBound,
        address[] calldata optionalPath,
        ITraderPool.ExchangeType exType
    ) external {
        ICoreProperties coreProperties = ITraderPool(address(this)).coreProperties();
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        require(from != to, "TP: ambiguous exchange");
        require(
            !coreProperties.isBlacklistedToken(from) && !coreProperties.isBlacklistedToken(to),
            "TP: blacklisted token"
        );
        require(
            from == poolParameters.baseToken || positions.contains(from),
            "TP: invalid exchange address"
        );

        priceFeed.checkAllowance(from);
        priceFeed.checkAllowance(to);

        if (to != poolParameters.baseToken) {
            positions.add(to);
        }

        uint256 amountGot;

        if (exType == ITraderPool.ExchangeType.FROM_EXACT) {
            _checkThisBalance(amount, from);
            amountGot = priceFeed.normExchangeFromExact(
                from,
                to,
                amount,
                optionalPath,
                amountBound
            );
        } else {
            _checkThisBalance(amountBound, from);
            amountGot = priceFeed.normExchangeToExact(from, to, amount, optionalPath, amountBound);

            (amount, amountGot) = (amountGot, amount);
        }

        emit Exchanged(msg.sender, from, to, amount, amountGot);

        if (from != poolParameters.baseToken && from.thisBalance() == 0) {
            positions.remove(from);

            emit PositionClosed(from);
        }

        require(
            positions.length() <= coreProperties.getMaximumOpenPositions(),
            "TP: max positions"
        );
    }

    function getExchangeAmount(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage positions,
        address from,
        address to,
        uint256 amount,
        address[] calldata optionalPath,
        ITraderPool.ExchangeType exType
    ) external view returns (uint256, address[] memory) {
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();
        ICoreProperties coreProperties = ITraderPool(address(this)).coreProperties();

        if (coreProperties.isBlacklistedToken(from) || coreProperties.isBlacklistedToken(to)) {
            return (0, new address[](0));
        }

        if (from == to || (from != poolParameters.baseToken && !positions.contains(from))) {
            return (0, new address[](0));
        }

        return
            exType == ITraderPool.ExchangeType.FROM_EXACT
                ? priceFeed.getNormalizedExtendedPriceOut(from, to, amount, optionalPath)
                : priceFeed.getNormalizedExtendedPriceIn(from, to, amount, optionalPath);
    }

    function _checkThisBalance(uint256 amount, address token) internal view {
        require(amount <= token.normThisBalance(), "TP: invalid exchange amount");
    }
}
