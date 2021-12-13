// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/trader/ITraderPoolProposal.sol";
import "../../interfaces/core/IPriceFeed.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "./TraderPoolPrice.sol";
import "../../libs/MathHelper.sol";

library TraderPoolLeverage {
    using MathHelper for uint256;
    using TraderPoolPrice for ITraderPool.PoolParameters;

    function _getNormalizedLeveragePoolPriceInUSD(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    ) internal view returns (uint256 totalInUSD, uint256 traderInUSD) {
        address trader = poolParameters.trader;
        address proposalPool = ITraderPool(address(this)).proposalPoolAddress();
        uint256 traderBalance = IERC20(address(this)).balanceOf(trader);

        totalInUSD = poolParameters.getNormalizedPoolPriceInUSD(openPositions, priceFeed);

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
