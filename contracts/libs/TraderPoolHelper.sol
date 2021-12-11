// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";
import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/ICoreProperties.sol";

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

    function _getNormalizedPoolPriceInUSD(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    ) internal view returns (uint256 totalBaseInUSD) {
        (uint256 totalBase, , , ) = getPoolPrice(poolParameters, openPositions, priceFeed);

        totalBase = totalBase.convertTo18(poolParameters.baseTokenDecimals);
        uint256 baseInUSD = priceFeed.getNormalizedPriceInUSD(poolParameters.baseToken, 10**18);

        totalBaseInUSD = (totalBase * baseInUSD) / 10**18;
    }

    function _getNormalizedLeveragePoolPriceInUSD(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    ) internal view returns (uint256 totalInUSD, uint256 traderInUSD) {
        address trader = poolParameters.trader;
        address proposalPool = ITraderPool(address(this)).proposalPoolAddress();
        uint256 traderBalance = IERC20(address(this)).balanceOf(trader);

        totalInUSD = _getNormalizedPoolPriceInUSD(poolParameters, openPositions, priceFeed);

        if (proposalPool != address(0)) {
            totalInUSD += ITraderPoolProposal(proposalPool).getInvestedBaseInUSD();
            traderBalance += ITraderPoolProposal(proposalPool).totalLPBalances(trader);
        }

        traderInUSD = totalInUSD.ratio(traderBalance, ITraderPool(address(this)).totalEmission());
    }

    function getMaxTraderLeverage(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed,
        ICoreProperties coreProperties
    ) public view returns (uint256 totalTokensUSD, uint256 maxTraderLeverageUSDTokens) {
        uint256 traderUSDTokens;

        (totalTokensUSD, traderUSDTokens) = _getNormalizedLeveragePoolPriceInUSD(
            poolParameters,
            openPositions,
            priceFeed
        );
        (uint256 threshold, uint256 slope) = coreProperties.getTraderLeverageParams();

        int256 traderUSD = int256(traderUSDTokens / 10**18);
        int256 multiplier = traderUSD / int256(threshold);

        int256 numerator = int256(threshold) +
            ((multiplier + 1) * (2 * traderUSD - int256(threshold))) -
            (multiplier * multiplier * int256(threshold));

        int256 boost = traderUSD * 2;

        maxTraderLeverageUSDTokens = uint256((numerator / int256(slope) + boost)) * 10**18;
    }
}
