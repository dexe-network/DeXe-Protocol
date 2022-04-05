// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolCommission.sol";
import "./TraderPoolLeverage.sol";
import "../../libs/MathHelper.sol";
import "../../libs/DecimalsConverter.sol";
import "../../libs/TokenBalance.sol";

library TraderPoolView {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TraderPoolPrice for ITraderPool.PoolParameters;
    using TraderPoolPrice for address;
    using TraderPoolCommission for ITraderPool.PoolParameters;
    using TraderPoolLeverage for ITraderPool.PoolParameters;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using TokenBalance for address;

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

        receptions.lpAmount = amountInBaseToInvest;
        receptions.positions = positionTokens;
        receptions.givenAmounts = new uint256[](positionTokens.length);
        receptions.receivedAmounts = new uint256[](positionTokens.length);

        if (totalBase > 0) {
            receptions.baseAmount = currentBaseAmount.ratio(amountInBaseToInvest, totalBase);
            receptions.lpAmount = receptions.lpAmount.ratio(
                IERC20(address(this)).totalSupply(),
                totalBase
            );
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

    function getReinvestCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPool.Commissions memory commissions) {
        if (ITraderPool(address(this)).totalOpenPositions() != 0) {
            return ITraderPool.Commissions(0, 0, 0);
        }

        uint256 to = (offset + limit).min(investors.length()).max(offset);
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        uint256 nextCommissionEpoch = poolParameters.nextCommissionEpoch();
        uint256 allBaseCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = investors.at(i);
            (, uint256 commissionUnlockEpoch) = TraderPool(address(this)).investorsInfo(investor);

            if (nextCommissionEpoch > commissionUnlockEpoch) {
                (, uint256 baseCommission, ) = poolParameters.calculateCommissionOnReinvest(
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

        if (totalSupply > 0) {
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
                    investor,
                    receptions.baseAmount,
                    amountLP
                );

                commissions = _getTraderAndPlatformCommissions(poolParameters, baseCommission);
            }
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

    function getLeverageInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
    ) public view returns (ITraderPool.LeverageInfo memory leverageInfo) {
        (
            leverageInfo.totalPoolUSDWithProposals,
            leverageInfo.traderLeverageUSDTokens
        ) = poolParameters.getMaxTraderLeverage(openPositions);

        if (leverageInfo.traderLeverageUSDTokens > leverageInfo.totalPoolUSDWithProposals) {
            leverageInfo.freeLeverageUSD =
                leverageInfo.traderLeverageUSDTokens -
                leverageInfo.totalPoolUSDWithProposals;
            leverageInfo.freeLeverageBase = ITraderPool(address(this))
                .priceFeed()
                .getNormalizedPriceOutBase(poolParameters.baseToken, leverageInfo.freeLeverageUSD);
        }
    }

    function _getUserInfo(
        address user,
        uint256 totalPoolBase,
        uint256 totalPoolUSD,
        uint256 totalSupply
    ) internal view returns (ITraderPool.UserInfo memory userInfo) {
        userInfo.poolLPBalance = IERC20(address(this)).balanceOf(user);
        (userInfo.investedBase, ) = TraderPool(address(this)).investorsInfo(user);

        if (totalSupply > 0) {
            userInfo.poolUSDShare = totalPoolUSD.ratio(userInfo.poolLPBalance, totalSupply);
            userInfo.poolBaseShare = totalPoolBase.ratio(userInfo.poolLPBalance, totalSupply);
        }
    }

    function getUsersInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions,
        EnumerableSet.AddressSet storage investors,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPool.UserInfo[] memory usersInfo) {
        uint256 to = (offset + limit).min(investors.length()).max(offset);
        (uint256 totalPoolBase, uint256 totalPoolUSD) = poolParameters
            .getNormalizedExtendedPoolPrice(openPositions);
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        usersInfo = new ITraderPool.UserInfo[](to - offset + 1);

        usersInfo[0] = _getUserInfo(
            poolParameters.trader,
            totalPoolBase,
            totalPoolUSD,
            totalSupply
        );

        for (uint256 i = offset; i < to; i++) {
            usersInfo[i - offset + 1] = _getUserInfo(
                investors.at(i),
                totalPoolBase,
                totalPoolUSD,
                totalSupply
            );
        }
    }

    function getPoolInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage openPositions
    ) external view returns (ITraderPool.PoolInfo memory poolInfo) {
        poolInfo.ticker = ERC20(address(this)).symbol();
        poolInfo.name = ERC20(address(this)).name();

        poolInfo.parameters = poolParameters;
        poolInfo.openPositions = openPositions.values();

        poolInfo.baseAndPositionBalances = new uint256[](poolInfo.openPositions.length + 1);
        poolInfo.baseAndPositionBalances[0] = poolInfo.parameters.baseToken.normThisBalance();

        for (uint256 i = 0; i < poolInfo.openPositions.length; i++) {
            poolInfo.baseAndPositionBalances[i + 1] = poolInfo.openPositions[i].normThisBalance();
        }

        poolInfo.totalInvestors = ITraderPool(address(this)).totalInvestors();

        (poolInfo.totalPoolBase, poolInfo.totalPoolUSD) = poolParameters
            .getNormalizedExtendedPoolPrice(openPositions);

        poolInfo.lpSupply = ERC20(address(this)).totalSupply();
        poolInfo.lpLockedInProposals =
            ITraderPool(address(this)).totalEmission() -
            poolInfo.lpSupply;
    }
}
