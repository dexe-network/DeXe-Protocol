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
import "../../libs/MathHelper.sol";
import "../../libs/DecimalsConverter.sol";

library TraderPoolView {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TraderPoolPrice for ITraderPool.PoolParameters;
    using TraderPoolCommission for ITraderPool.PoolParameters;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;

    struct Commissions {
        uint256 traderBaseCommission;
        uint256 dexeBaseCommission;
        uint256 dexeDexeCommission;
    }

    struct Receptions {
        uint256 baseAmount;
        address[] positions;
        uint256[] receivedAmounts;
    }

    function _getTraderAndPlatformCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseCommission
    ) internal view returns (Commissions memory commissions) {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;
        (uint256 dexePercentage, , ) = ITraderPool(address(this))
            .coreProperties()
            .getDEXECommissionPercentages();

        commissions.dexeBaseCommission = baseCommission.percentage(dexePercentage).convertFrom18(
            baseTokenDecimals
        );
        commissions.traderBaseCommission =
            baseCommission.convertFrom18(baseTokenDecimals) -
            commissions.dexeBaseCommission;
        commissions.dexeDexeCommission = ITraderPool(address(this)).priceFeed().getPriceInDEXE(
            poolParameters.baseToken,
            commissions.dexeBaseCommission
        );
    }

    function getInvestTokens(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        uint256 amountInBaseToInvest
    ) public view returns (Receptions memory receptions) {
        (
            uint256 totalBase,
            uint256 currentBaseAmount,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getPoolPrice(openPositions);

        receptions.positions = positionTokens;
        receptions.receivedAmounts = new uint256[](positionTokens.length);

        uint256 baseConverted = amountInBaseToInvest.convertFrom18(
            poolParameters.baseTokenDecimals
        );

        address baseToken = poolParameters.baseToken;
        receptions.baseAmount = currentBaseAmount.ratio(baseConverted, totalBase);

        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        for (uint256 i = 0; i < positionTokens.length; i++) {
            receptions.receivedAmounts[i] = priceFeed.getPriceIn(
                baseToken,
                positionTokens[i],
                positionPricesInBase[i].ratio(baseConverted, totalBase)
            );
        }
    }

    function getReinvestCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        mapping(address => ITraderPool.InvestorInfo) storage investorsInfo,
        uint256 openPositionsAmount,
        uint256 offset,
        uint256 limit
    ) public view returns (Commissions memory commissions) {
        if (openPositionsAmount != 0) {
            return Commissions(0, 0, 0);
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
    ) public view returns (Receptions memory receptions, Commissions memory commissions) {
        IERC20 baseToken = IERC20(poolParameters.baseToken);
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();

        uint256 totalSupply = IERC20(address(this)).totalSupply();
        uint256 length = openPositions.length();

        receptions.positions = new address[](length);
        receptions.receivedAmounts = new uint256[](length);

        uint256 investorBaseAmount = baseToken.balanceOf(address(this)).ratio(
            amountLP,
            totalSupply
        );

        for (uint256 i = 0; i < length; i++) {
            receptions.positions[i] = openPositions.at(i);

            uint256 positionAmount = ERC20(receptions.positions[i]).balanceOf(address(this)).ratio(
                amountLP,
                totalSupply
            );

            receptions.receivedAmounts[i] = priceFeed.getPriceIn(
                receptions.positions[i],
                address(baseToken),
                positionAmount
            );
            investorBaseAmount += receptions.receivedAmounts[i];
        }

        if (investor != poolParameters.trader) {
            (uint256 baseCommission, ) = poolParameters.calculateCommissionOnDivest(
                investorInfo,
                investor,
                investorBaseAmount,
                amountLP
            );

            receptions.baseAmount = (investorBaseAmount - baseCommission).convertFrom18(
                poolParameters.baseTokenDecimals
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
        address[] memory optionalPath
    ) public view returns (uint256) {
        if (from == to || (from != poolParameters.baseToken && !openPositions.contains(from))) {
            return 0;
        }

        return
            ITraderPool(address(this)).priceFeed().getExtendedPriceIn(
                from,
                to,
                amount.convertFrom18(ERC20(from).decimals()),
                optionalPath
            );
    }
}
