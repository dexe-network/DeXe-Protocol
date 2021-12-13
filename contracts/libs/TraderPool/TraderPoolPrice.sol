// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../libs/DecimalsConverter.sol";

library TraderPoolPrice {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;

    function getNormalizedBaseInPool(ITraderPool.PoolParameters storage poolParameters)
        public
        view
        returns (uint256)
    {
        return
            IERC20(poolParameters.baseToken).balanceOf(address(this)).convertTo18(
                poolParameters.baseTokenDecimals
            );
    }

    function getPoolPrice(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
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
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();
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

    function getNormalizedPoolPriceInUSD(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
    ) public view returns (uint256 totalBaseInUSD) {
        (uint256 totalBase, , , ) = getPoolPrice(poolParameters, openPositions);

        totalBase = totalBase.convertTo18(poolParameters.baseTokenDecimals);
        uint256 baseInUSD = ITraderPool(address(this)).priceFeed().getNormalizedPriceInUSD(
            poolParameters.baseToken,
            10**18
        );

        totalBaseInUSD = (totalBase * baseInUSD) / 10**18;
    }
}
