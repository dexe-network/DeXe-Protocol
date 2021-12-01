// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";
import "../interfaces/core/IPriceFeed.sol";

import "../libs/DecimalsConverter.sol";
import "../core/Globals.sol";
import "../libs/MathHelper.sol";

library TraderPoolHelper {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;

    function getPoolPrice(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    )
        public
        view
        returns (
            uint256 totalPriceInBase,
            uint256 currentBaseAmount,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        )
    {
        uint256 length = openPositions.length();

        IERC20 baseToken = IERC20(poolParameters.baseToken);
        totalPriceInBase = currentBaseAmount = baseToken.balanceOf(address(this));

        positionTokens = new address[](length);
        positionPricesInBase = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            positionTokens[i] = openPositions.at(i);

            positionPricesInBase[i] = priceFeed.getPriceIn(
                positionTokens[i],
                address(baseToken),
                IERC20(positionTokens[i]).balanceOf(address(this))
            );

            totalPriceInBase += positionPricesInBase[i];
        }
    }

    function getPoolPriceInDAI(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    ) public view returns (uint256 totalBaseInToken, uint256 positionsInToken) {
        (uint256 totalBase, uint256 currentBase, , ) = getPoolPrice(
            poolParameters,
            openPositions,
            priceFeed
        );

        uint256 baseInToken = priceFeed.getPriceInDAI(
            poolParameters.baseToken,
            10**poolParameters.baseTokenDecimals
        );

        totalBaseInToken = totalBase * baseInToken;
        positionsInToken = (totalBase - currentBase) * baseInToken;
    }

    function getLeveragePoolPriceInDAI(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    ) public view returns (uint256 totalInDAI, uint256 traderInDAI) {
        address trader = poolParameters.trader;
        address proposalPool = ITraderPool(address(this)).proposalPoolAddress();
        uint256 traderBalance = IERC20(address(this)).balanceOf(trader);

        (totalInDAI, ) = getPoolPriceInDAI(poolParameters, openPositions, priceFeed);

        if (proposalPool != address(0)) {
            totalInDAI += ITraderPoolProposal(proposalPool).getBalanceBaseInDAI();
            traderBalance += ITraderPoolProposal(proposalPool).totalLPBalances(trader);
        }

        traderInDAI = totalInDAI.ratio(traderBalance, ITraderPool(address(this)).totalEmission());
    }

    function getMaxTraderLeverage(
        uint256 traderDAI,
        uint256 threshold,
        uint256 slope
    ) public pure returns (uint256 maxTraderLeverageDAI) {
        int256 traderUSD = int256(traderDAI / 10**18);
        int256 multiplier = traderUSD / int256(threshold);

        int256 numerator = int256(threshold) +
            ((multiplier + 1) * (2 * traderUSD - int256(threshold))) -
            (multiplier * multiplier * int256(threshold));

        int256 boost = traderUSD * 2;

        maxTraderLeverageDAI = uint256((numerator / int256(slope) + boost)) * 10**18;
    }
}
