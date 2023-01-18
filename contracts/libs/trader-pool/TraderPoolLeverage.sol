// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/trader/ITraderPoolProposal.sol";

import "./TraderPoolPrice.sol";
import "../../libs/math/MathHelper.sol";

library TraderPoolLeverage {
    using MathHelper for uint256;
    using TraderPoolPrice for *;

    function getMaxTraderLeverage(
        ITraderPool.PoolParameters storage poolParameters
    ) public view returns (uint256 totalTokensUSD, uint256 maxTraderLeverageUSDTokens) {
        uint256 traderUSDTokens;

        (totalTokensUSD, traderUSDTokens) = _getNormalizedLeveragePoolPriceInUSD(poolParameters);
        (uint256 threshold, uint256 slope) = TraderPool(address(this))
            .coreProperties()
            .getTraderLeverageParams();

        int256 traderUSD = int256(traderUSDTokens / DECIMALS);
        int256 multiplier = traderUSD / int256(threshold);

        int256 numerator = int256(threshold) +
            ((multiplier + 1) * (2 * traderUSD - int256(threshold))) -
            (multiplier * multiplier * int256(threshold));

        int256 boost = traderUSD * 2;

        maxTraderLeverageUSDTokens = uint256((numerator / int256(slope) + boost)) * DECIMALS;
    }

    function checkLeverage(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountInBaseToInvest
    ) external view {
        if (msg.sender == poolParameters.trader) {
            return;
        }

        (uint256 totalPriceInUSD, uint256 maxTraderVolumeInUSD) = getMaxTraderLeverage(
            poolParameters
        );
        (uint256 addInUSD, ) = TraderPool(address(this)).priceFeed().getNormalizedPriceOutUSD(
            poolParameters.baseToken,
            amountInBaseToInvest
        );

        require(addInUSD + totalPriceInUSD <= maxTraderVolumeInUSD, "TP: leverage exceeded");
    }

    function _getNormalizedLeveragePoolPriceInUSD(
        ITraderPool.PoolParameters storage poolParameters
    ) internal view returns (uint256 totalInUSD, uint256 traderInUSD) {
        address trader = poolParameters.trader;
        address proposalPool = TraderPool(address(this)).proposalPoolAddress();
        uint256 totalEmission = TraderPool(address(this)).totalEmission();
        uint256 traderBalance = IERC20(address(this)).balanceOf(trader);

        (, totalInUSD) = poolParameters.getNormalizedPoolPriceAndUSD();

        if (proposalPool != address(0)) {
            totalInUSD += ITraderPoolProposal(proposalPool).getInvestedBaseInUSD();
            traderBalance += ITraderPoolProposal(proposalPool).totalLPBalances(trader);
        }

        if (totalEmission > 0) {
            traderInUSD = totalInUSD.ratio(traderBalance, totalEmission);
        }
    }
}
