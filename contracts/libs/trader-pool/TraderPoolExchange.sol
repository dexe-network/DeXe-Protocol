// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "../../trader/TraderPool.sol";

import "../price-feed/PriceFeedLocal.sol";
import "../utils/TokenBalance.sol";

library TraderPoolExchange {
    using EnumerableSet for EnumerableSet.AddressSet;
    using PriceFeedLocal for IPriceFeed;
    using TokenBalance for address;

    /// @notice Emitted when position is opened
    /// @param position Address of the position
    event PositionOpened(address position);

    /// @notice Emitted when exchange is performed
    /// @param sender Address of the sender
    /// @param fromToken Address of the token to exchange from
    /// @param toToken Address of the token to exchange to
    /// @param fromVolume Amount of the token to exchange from
    /// @param toVolume Amount of the token to exchange to
    event Exchanged(
        address sender,
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    /// @notice Emitted when position is closed
    /// @param position Address of the position
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
        TraderPool traderPool = TraderPool(address(this));

        ICoreProperties coreProperties = traderPool.coreProperties();
        IPriceFeed priceFeed = traderPool.priceFeed();

        require(from != to, "TP: ambiguous exchange");
        require(!coreProperties.isBlacklistedToken(to), "TP: blacklisted token");
        require(
            from == poolParameters.baseToken || positions.contains(from),
            "TP: invalid exchange address"
        );

        priceFeed.checkAllowance(from);
        priceFeed.checkAllowance(to);

        if (to != poolParameters.baseToken && positions.add(to)) {
            emit PositionOpened(to);
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
        TraderPool traderPool = TraderPool(address(this));

        IPriceFeed priceFeed = traderPool.priceFeed();
        ICoreProperties coreProperties = traderPool.coreProperties();

        if (
            coreProperties.isBlacklistedToken(to) ||
            from == to ||
            (from != poolParameters.baseToken && !positions.contains(from))
        ) {
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
