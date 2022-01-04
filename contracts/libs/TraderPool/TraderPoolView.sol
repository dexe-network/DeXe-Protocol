// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolCommission.sol";
import "./TraderPoolLeverage.sol";
import "../../libs/MathHelper.sol";
import "../../libs/DecimalsConverter.sol";

library TraderPoolView {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TraderPoolPrice for ITraderPool.PoolParameters;
    using TraderPoolCommission for ITraderPool.PoolParameters;
    using TraderPoolLeverage for ITraderPool.PoolParameters;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;

    function _getTraderAndPlatformCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseCommission
    ) internal view returns (ITraderPool.Commissions memory commissions) {
        (uint256 dexePercentage, , ) = ITraderPool(address(this))
            .coreProperties()
            .getDEXECommissionPercentages();

        commissions.dexeBaseCommission = baseCommission.percentage(dexePercentage);
        commissions.traderBaseCommission = baseCommission - commissions.dexeBaseCommission;
        commissions.dexeDexeCommission = ITraderPool(address(this))
            .priceFeed()
            .getNormalizedPriceOutDEXE(poolParameters.baseToken, commissions.dexeBaseCommission);
    }

    function getInvestTokens(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        uint256 amountInBaseToInvest
    ) external view returns (ITraderPool.Receptions memory receptions) {
        (
            uint256 totalBase,
            uint256 currentBaseAmount,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getNormalizedPoolPrice(openPositions);

        receptions.positions = positionTokens;
        receptions.givenAmounts = new uint256[](positionTokens.length);
        receptions.receivedAmounts = new uint256[](positionTokens.length);

        if (totalBase > 0) {
            receptions.baseAmount = currentBaseAmount.ratio(amountInBaseToInvest, totalBase);
        }

        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        for (uint256 i = 0; i < positionTokens.length; i++) {
            receptions.givenAmounts[i] = positionPricesInBase[i].ratio(
                amountInBaseToInvest,
                totalBase
            );
            receptions.receivedAmounts[i] = priceFeed.getNormalizedPriceOut(
                poolParameters.baseToken,
                positionTokens[i],
                receptions.givenAmounts[i]
            );
        }
    }

    function getLeverageInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
    ) external view returns (ITraderPool.LeverageInfo memory leverageInfo) {
        (leverageInfo.totalPoolUSD, leverageInfo.traderLeverageUSDTokens) = poolParameters
            .getMaxTraderLeverage(openPositions);

        if (leverageInfo.traderLeverageUSDTokens > leverageInfo.totalPoolUSD) {
            leverageInfo.freeLeverageUSD =
                leverageInfo.traderLeverageUSDTokens -
                leverageInfo.totalPoolUSD;
            leverageInfo.freeLeverageBase = ITraderPool(address(this))
                .priceFeed()
                .getNormalizedPriceOutBase(poolParameters.baseToken, leverageInfo.freeLeverageUSD);
        }
    }

    function getReinvestCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        mapping(address => ITraderPool.InvestorInfo) storage investorsInfo,
        uint256 openPositionsAmount,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPool.Commissions memory commissions) {
        if (openPositionsAmount != 0) {
            return ITraderPool.Commissions(0, 0, 0);
        }

        uint256 to = (offset + limit).min(investors.length()).max(offset);
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        uint256 nextCommissionEpoch = poolParameters.nextCommissionEpoch();
        uint256 allBaseCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = investors.at(i);

            if (nextCommissionEpoch > investorsInfo[investor].commissionUnlockEpoch) {
                (, uint256 baseCommission, ) = poolParameters.calculateCommissionOnReinvest(
                    investorsInfo[investor],
                    investor,
                    totalSupply
                );

                allBaseCommission += baseCommission;
            }
        }

        return _getTraderAndPlatformCommissions(poolParameters, allBaseCommission);
    }

    function getDivestAmountsAndCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        ITraderPool.InvestorInfo storage investorInfo,
        address investor,
        uint256 amountLP
    )
        external
        view
        returns (
            ITraderPool.Receptions memory receptions,
            ITraderPool.Commissions memory commissions
        )
    {
        ERC20 baseToken = ERC20(poolParameters.baseToken);
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        uint256 totalSupply = IERC20(address(this)).totalSupply();
        uint256 length = openPositions.length();

        receptions.positions = new address[](length);
        receptions.givenAmounts = new uint256[](length);
        receptions.receivedAmounts = new uint256[](length);

        receptions.baseAmount = baseToken
            .balanceOf(address(this))
            .ratio(amountLP, totalSupply)
            .convertTo18(baseToken.decimals());

        for (uint256 i = 0; i < length; i++) {
            receptions.positions[i] = openPositions.at(i);
            receptions.givenAmounts[i] = ERC20(receptions.positions[i])
                .balanceOf(address(this))
                .ratio(amountLP, totalSupply)
                .convertTo18(ERC20(receptions.positions[i]).decimals());

            receptions.receivedAmounts[i] = priceFeed.getNormalizedPriceOut(
                receptions.positions[i],
                address(baseToken),
                receptions.givenAmounts[i]
            );
            receptions.baseAmount += receptions.receivedAmounts[i];
        }

        if (investor != poolParameters.trader) {
            (uint256 baseCommission, ) = poolParameters.calculateCommissionOnDivest(
                investorInfo,
                investor,
                receptions.baseAmount,
                amountLP
            );

            commissions = _getTraderAndPlatformCommissions(poolParameters, baseCommission);
        }
    }

    function getExchangeAmount(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        address from,
        address to,
        uint256 amount,
        address[] calldata optionalPath,
        bool fromExact
    ) external view returns (uint256) {
        if (from == to || (from != poolParameters.baseToken && !openPositions.contains(from))) {
            return 0;
        }

        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        return
            fromExact
                ? priceFeed.getNormalizedExtendedPriceOut(from, to, amount, optionalPath)
                : priceFeed.getNormalizedExtendedPriceIn(from, to, amount, optionalPath);
    }
}
