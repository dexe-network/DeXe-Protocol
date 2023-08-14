// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/trader/ITraderPool.sol";
import "../../../interfaces/core/IPriceFeed.sol";

import "../../../trader/TraderPool.sol";

import "../../price-feed/PriceFeedLocal.sol";
import "./TraderPoolPrice.sol";
import "./TraderPoolLeverage.sol";
import "../../math/MathHelper.sol";

library TraderPoolInvest {
    using SafeERC20 for IERC20Metadata;
    using DecimalsConverter for *;
    using TraderPoolPrice for *;
    using TraderPoolLeverage for *;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using PriceFeedLocal for IPriceFeed;

    /// @notice Emitted when position is opened
    /// @param position Address of the position
    event PositionOpened(address position);

    /// @notice Emitted when active portfolio is exchanged
    /// @param fromToken Address of the token to exchange from
    /// @param toToken Address of the token to exchange to
    /// @param fromVolume Amount of the token to exchange from
    /// @param toVolume Amount of the token to exchange to
    event ActivePortfolioExchanged(
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );
    event Exchanged(
        address sender,
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    function invest(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) external {
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= poolParameters.minimalInvestment, "TP: underinvestment");

        TraderPool traderPool = TraderPool(address(this));

        poolParameters.checkLeverage(amountInBaseToInvest);

        uint256 toMintLP = investPositions(
            poolParameters,
            msg.sender,
            amountInBaseToInvest,
            minPositionsOut
        );

        traderPool.updateTo(msg.sender, toMintLP, amountInBaseToInvest);
        traderPool.mint(msg.sender, toMintLP);
    }

    function investInitial(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage positions,
        uint256[] calldata amounts,
        address[] calldata tokens,
        uint256 minLPOut
    ) external {
        TraderPool traderPool = TraderPool(address(this));
        IPriceFeed priceFeed = traderPool.priceFeed();
        uint256 totalInvestedBaseAmount;

        (uint256 totalBase, , , ) = poolParameters.getNormalizedPoolPriceAndPositions();

        for (uint256 i = 0; i < tokens.length; i++) {
            require(
                !traderPool.coreProperties().isBlacklistedToken(tokens[i]),
                "TP: token in blacklist"
            );

            IERC20Metadata(tokens[i]).safeTransferFrom(
                msg.sender,
                address(this),
                amounts[i].from18(tokens[i].decimals())
            );

            priceFeed.checkAllowance(tokens[i]);

            uint256 baseAmount;

            if (tokens[i] != poolParameters.baseToken) {
                (baseAmount, ) = priceFeed.getNormalizedPriceOut(
                    tokens[i],
                    poolParameters.baseToken,
                    amounts[i]
                );

                if (positions.add(tokens[i])) {
                    emit PositionOpened(tokens[i]);
                    emit Exchanged(
                        msg.sender,
                        poolParameters.baseToken,
                        tokens[i],
                        baseAmount,
                        amounts[i]
                    );
                } else {
                    emit ActivePortfolioExchanged(
                        poolParameters.baseToken,
                        tokens[i],
                        baseAmount,
                        amounts[i]
                    );
                }
            } else {
                baseAmount = amounts[i];
            }

            totalInvestedBaseAmount += baseAmount;
        }

        require(
            positions.length() <= traderPool.coreProperties().getMaximumOpenPositions(),
            "TP: max positions"
        );

        uint256 toMintLP = _calculateToMintLP(poolParameters, totalBase, totalInvestedBaseAmount);

        require(toMintLP >= minLPOut, "TP: minLPOut < toLP");

        traderPool.updateTo(msg.sender, toMintLP, totalInvestedBaseAmount);
        traderPool.mint(msg.sender, toMintLP);
    }

    function investPositions(
        ITraderPool.PoolParameters storage poolParameters,
        address baseHolder,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) public returns (uint256 toMintLP) {
        address baseToken = poolParameters.baseToken;
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getNormalizedPoolPriceAndPositions();

        toMintLP = _transferBase(poolParameters, baseHolder, totalBase, amountInBaseToInvest);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 amount = positionPricesInBase[i].ratio(amountInBaseToInvest, totalBase);
            uint256 amountGot = TraderPool(address(this)).priceFeed().normalizedExchangeFromExact(
                baseToken,
                positionTokens[i],
                amount,
                new address[](0),
                minPositionsOut[i]
            );

            emit ActivePortfolioExchanged(baseToken, positionTokens[i], amount, amountGot);
        }
    }

    function _transferBase(
        ITraderPool.PoolParameters storage poolParameters,
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        IERC20Metadata(poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.from18(poolParameters.baseTokenDecimals)
        );

        return _calculateToMintLP(poolParameters, totalBaseInPool, amountInBaseToInvest);
    }

    function _calculateToMintLP(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 totalBaseInPool,
        uint256 toMintLP
    ) internal returns (uint256) {
        TraderPool traderPool = TraderPool(address(this));

        uint256 totalLPTokens = traderPool.totalSupply();

        if (totalLPTokens > 0 && totalBaseInPool > 0) {
            toMintLP = toMintLP.ratio(totalLPTokens, totalBaseInPool);
        }

        require(
            poolParameters.totalLPEmission == 0 ||
                traderPool.totalEmission() + toMintLP <= poolParameters.totalLPEmission,
            "TP: minting > emission"
        );

        traderPool.setLatestInvestBlock(msg.sender);

        return toMintLP;
    }
}
