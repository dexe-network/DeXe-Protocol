// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolCommission.sol";
import "./TraderPoolLeverage.sol";
import "../MathHelper.sol";
import "../DecimalsConverter.sol";
import "../TokenBalance.sol";
import "../PriceFeed/PriceFeedLocal.sol";

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
    using PriceFeedLocal for IPriceFeed;

    function _getTraderAndPlatformCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseCommission,
        uint256 lpCommission
    ) internal view returns (ITraderPool.Commissions memory commissions) {
        IPriceFeed priceFeed = ITraderPool(address(this)).priceFeed();
        (uint256 dexePercentage, , ) = ITraderPool(address(this))
            .coreProperties()
            .getDEXECommissionPercentages();

        (uint256 usdCommission, ) = priceFeed.getNormalizedPriceOutUSD(
            poolParameters.baseToken,
            baseCommission
        );

        commissions.dexeBaseCommission = baseCommission.percentage(dexePercentage);
        commissions.dexeLPCommission = lpCommission.percentage(dexePercentage);
        commissions.dexeUSDCommission = usdCommission.percentage(dexePercentage);

        commissions.traderBaseCommission = baseCommission - commissions.dexeBaseCommission;
        commissions.traderLPCommission = lpCommission - commissions.dexeLPCommission;
        commissions.traderUSDCommission = usdCommission - commissions.dexeUSDCommission;

        (commissions.dexeDexeCommission, ) = priceFeed.getNormalizedPriceOutDEXE(
            poolParameters.baseToken,
            commissions.dexeBaseCommission
        );
    }

    function getInvestTokens(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountInBaseToInvest
    ) external view returns (ITraderPool.Receptions memory receptions) {
        (
            uint256 totalBase,
            uint256 currentBaseAmount,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getNormalizedPoolPriceAndPositions();

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
            receptions.receivedAmounts[i] = priceFeed.getNormPriceOut(
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
        uint256 to = (offset + limit).min(investors.length()).max(offset);
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        uint256 nextCommissionEpoch = poolParameters.nextCommissionEpoch();
        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = investors.at(i);
            (, uint256 commissionUnlockEpoch) = TraderPool(address(this)).investorsInfo(investor);

            if (nextCommissionEpoch > commissionUnlockEpoch) {
                (, uint256 baseCommission, uint256 lpCommission) = poolParameters
                    .calculateCommissionOnReinvest(investor, totalSupply);

                allBaseCommission += baseCommission;
                allLPCommission += lpCommission;
            }
        }

        return
            _getTraderAndPlatformCommissions(poolParameters, allBaseCommission, allLPCommission);
    }

    function getDivestAmountsAndCommissions(
        ITraderPool.PoolParameters storage poolParameters,
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
        address[] memory openPositions = ITraderPool(address(this)).openPositions();

        uint256 totalSupply = IERC20(address(this)).totalSupply();

        receptions.positions = new address[](openPositions.length);
        receptions.givenAmounts = new uint256[](openPositions.length);
        receptions.receivedAmounts = new uint256[](openPositions.length);

        if (totalSupply > 0) {
            receptions.baseAmount = baseToken
                .balanceOf(address(this))
                .ratio(amountLP, totalSupply)
                .convertTo18(baseToken.decimals());

            for (uint256 i = 0; i < openPositions.length; i++) {
                receptions.positions[i] = openPositions[i];
                receptions.givenAmounts[i] = ERC20(receptions.positions[i])
                    .balanceOf(address(this))
                    .ratio(amountLP, totalSupply)
                    .convertTo18(ERC20(receptions.positions[i]).decimals());

                receptions.receivedAmounts[i] = priceFeed.getNormPriceOut(
                    receptions.positions[i],
                    address(baseToken),
                    receptions.givenAmounts[i]
                );
                receptions.baseAmount += receptions.receivedAmounts[i];
            }

            if (investor != poolParameters.trader) {
                (uint256 baseCommission, uint256 lpCommission) = poolParameters
                    .calculateCommissionOnDivest(investor, receptions.baseAmount, amountLP);

                commissions = _getTraderAndPlatformCommissions(
                    poolParameters,
                    baseCommission,
                    lpCommission
                );
            }
        }
    }

    function getLeverageInfo(ITraderPool.PoolParameters storage poolParameters)
        public
        view
        returns (ITraderPool.LeverageInfo memory leverageInfo)
    {
        (
            leverageInfo.totalPoolUSDWithProposals,
            leverageInfo.traderLeverageUSDTokens
        ) = poolParameters.getMaxTraderLeverage();

        if (leverageInfo.traderLeverageUSDTokens > leverageInfo.totalPoolUSDWithProposals) {
            leverageInfo.freeLeverageUSD =
                leverageInfo.traderLeverageUSDTokens -
                leverageInfo.totalPoolUSDWithProposals;
            (leverageInfo.freeLeverageBase, ) = ITraderPool(address(this))
                .priceFeed()
                .getNormalizedPriceInUSD(poolParameters.baseToken, leverageInfo.freeLeverageUSD);
        }
    }

    function _getUserBalancesInfo(
        address user,
        uint256 totalPoolBase,
        uint256 totalPoolUSD,
        uint256 totalSupply,
        ICoreProperties.CommissionPeriod commissionPeriod
    ) internal view returns (ITraderPool.UserInfo memory userInfo) {
        ICoreProperties coreProperties = ITraderPool(address(this)).coreProperties();

        userInfo.poolLPBalance = IERC20(address(this)).balanceOf(user);
        (userInfo.investedBase, userInfo.commissionUnlockTimestamp) = TraderPool(address(this))
            .investorsInfo(user);

        userInfo.commissionUnlockTimestamp = userInfo.commissionUnlockTimestamp == 0
            ? coreProperties.getCommissionEpochByTimestamp(block.timestamp, commissionPeriod)
            : userInfo.commissionUnlockTimestamp;

        userInfo.commissionUnlockTimestamp = coreProperties.getCommissionTimestampByEpoch(
            userInfo.commissionUnlockTimestamp,
            commissionPeriod
        );

        if (totalSupply > 0) {
            userInfo.poolUSDShare = totalPoolUSD.ratio(userInfo.poolLPBalance, totalSupply);
            userInfo.poolBaseShare = totalPoolBase.ratio(userInfo.poolLPBalance, totalSupply);
        }
    }

    function getUsersInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPool.UserInfo[] memory usersInfo) {
        uint256 to = (offset + limit).min(investors.length()).max(offset);
        (uint256 totalPoolBase, uint256 totalPoolUSD) = poolParameters
            .getNormalizedPoolPriceAndUSD();
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        usersInfo = new ITraderPool.UserInfo[](to - offset + 1);

        usersInfo[0] = _getUserBalancesInfo(
            poolParameters.trader,
            totalPoolBase,
            totalPoolUSD,
            totalSupply,
            poolParameters.commissionPeriod
        );

        for (uint256 i = offset; i < to; i++) {
            usersInfo[i - offset + 1] = _getUserBalancesInfo(
                investors.at(i),
                totalPoolBase,
                totalPoolUSD,
                totalSupply,
                poolParameters.commissionPeriod
            );
        }
    }

    function getPoolInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage positions
    ) external view returns (ITraderPool.PoolInfo memory poolInfo) {
        poolInfo.ticker = ERC20(address(this)).symbol();
        poolInfo.name = ERC20(address(this)).name();

        poolInfo.parameters = poolParameters;
        poolInfo.openPositions = ITraderPool(address(this)).openPositions();

        poolInfo.baseAndPositionBalances = new uint256[](poolInfo.openPositions.length + 1);
        poolInfo.baseAndPositionBalances[0] = poolInfo.parameters.baseToken.normThisBalance();

        for (uint256 i = 0; i < poolInfo.openPositions.length; i++) {
            poolInfo.baseAndPositionBalances[i + 1] = poolInfo.openPositions[i].normThisBalance();
        }

        poolInfo.totalBlacklistedPositions = positions.length() - poolInfo.openPositions.length;
        poolInfo.totalInvestors = ITraderPool(address(this)).totalInvestors();

        (poolInfo.totalPoolBase, poolInfo.totalPoolUSD) = poolParameters
            .getNormalizedPoolPriceAndUSD();

        poolInfo.lpSupply = IERC20(address(this)).totalSupply();
        poolInfo.lpLockedInProposals =
            ITraderPool(address(this)).totalEmission() -
            poolInfo.lpSupply;

        if (poolInfo.lpSupply > 0) {
            poolInfo.traderLPBalance = IERC20(address(this)).balanceOf(poolParameters.trader);
            poolInfo.traderUSD = poolInfo.totalPoolUSD.ratio(
                poolInfo.traderLPBalance,
                poolInfo.lpSupply
            );
            poolInfo.traderBase = poolInfo.totalPoolBase.ratio(
                poolInfo.traderLPBalance,
                poolInfo.lpSupply
            );
        }
    }
}
