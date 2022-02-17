// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../libs/DecimalsConverter.sol";

library TraderPoolPrice {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;

    function getNormalizedBalance(address token) public view returns (uint256) {
        return IERC20(token).balanceOf(address(this)).convertTo18(ERC20(token).decimals());
    }

    function getNormalizedPoolPrice(
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

        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();
        totalPriceInBase = currentBaseAmount = getNormalizedBalance(poolParameters.baseToken);

        positionTokens = new address[](length);
        positionPricesInBase = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            positionTokens[i] = openPositions.at(i);

            positionPricesInBase[i] = priceFeed.getNormalizedPriceOut(
                positionTokens[i],
                poolParameters.baseToken,
                getNormalizedBalance(positionTokens[i])
            );

            totalPriceInBase += positionPricesInBase[i];
        }
    }

    function getNormalizedExtendedPoolPrice(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
    ) external view returns (uint256 totalBase, uint256 totalUSD) {
        (totalBase, , , ) = getNormalizedPoolPrice(poolParameters, openPositions);

        totalUSD = ITraderPool(address(this)).priceFeed().getNormalizedPriceOutUSD(
            poolParameters.baseToken,
            totalBase
        );
    }
}
