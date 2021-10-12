// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";

import "../libs/DecimalsConverter.sol";
import "../core/Globals.sol";

library TraderPoolHelper {
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;

    function getOpenPositionsPrice(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        IPriceFeed priceFeed
    )
        internal
        view
        returns (
            uint256 totalPriceInBase,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        )
    {
        uint256 length = openPositions.length();

        IERC20 baseToken = IERC20(poolParameters.baseToken);
        totalPriceInBase = baseToken.balanceOf(address(this));

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

    function calculateCommission(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 investorBaseAmount,
        uint256 investorLPAmount,
        uint256 investedBaseAmount
    ) internal view returns (uint256 baseCommission, uint256 lpCommission) {
        if (investorBaseAmount > investedBaseAmount) {
            baseCommission =
                ((investorBaseAmount - investedBaseAmount) * poolParameters.commissionPercentage) /
                PERCENTAGE_100;

            lpCommission = (investorLPAmount * baseCommission) / investorBaseAmount;
        }
    }
}
