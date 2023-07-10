// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../trader/TraderPool.sol";

import "../../libs/utils/TokenBalance.sol";

library TraderPoolPrice {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TokenBalance for address;

    function getNormalizedPoolPriceAndUSD(
        ITraderPool.PoolParameters storage poolParameters
    ) external view returns (uint256 totalBase, uint256 totalUSD) {
        (totalBase, , , ) = getNormalizedPoolPriceAndPositions(poolParameters);

        (totalUSD, ) = TraderPool(address(this)).priceFeed().getNormalizedPriceOutUSD(
            poolParameters.baseToken,
            totalBase
        );
    }

    function getNormalizedPoolPriceAndPositions(
        ITraderPool.PoolParameters storage poolParameters
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
        TraderPool traderPool = TraderPool(address(this));

        IPriceFeed priceFeed = traderPool.priceFeed();
        positionTokens = traderPool.openPositions();
        totalPriceInBase = currentBaseAmount = poolParameters.baseToken.normThisBalance();

        positionPricesInBase = new uint256[](positionTokens.length);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            (positionPricesInBase[i], ) = priceFeed.getNormalizedPriceOut(
                positionTokens[i],
                poolParameters.baseToken,
                positionTokens[i].normThisBalance()
            );

            totalPriceInBase += positionPricesInBase[i];
        }
    }
}
