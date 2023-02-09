// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolCommission.sol";
import "./TraderPoolLeverage.sol";
import "../math/MathHelper.sol";
import "../utils/TokenBalance.sol";
import "../price-feed/PriceFeedLocal.sol";

library TraderPoolView {
    using EnumerableSet for EnumerableSet.AddressSet;
    using TraderPoolPrice for *;
    using TraderPoolCommission for *;
    using TraderPoolLeverage for *;
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using Math for uint256;
    using TokenBalance for address;
    using PriceFeedLocal for IPriceFeed;

    function getUsersInfo(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ITraderPool.UserInfo[] memory usersInfo) {
        uint256 to = (offset + limit).min(investors.length()).max(offset);

        (uint256 totalPoolBase, uint256 totalPoolUSD) = poolParameters
            .getNormalizedPoolPriceAndUSD();
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        usersInfo = new ITraderPool.UserInfo[](to - offset + 2);

        if (investors.contains(user)) {
            usersInfo[0] = _getUserInfo(
                poolParameters,
                user,
                totalPoolBase,
                totalPoolUSD,
                totalSupply
            );
        }

        usersInfo[1] = _getUserInfo(
            poolParameters,
            poolParameters.trader,
            totalPoolBase,
            totalPoolUSD,
            totalSupply
        );

        for (uint256 i = offset; i < to; i++) {
            usersInfo[i - offset + 2] = _getUserInfo(
                poolParameters,
                investors.at(i),
                totalPoolBase,
                totalPoolUSD,
                totalSupply
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
        poolInfo.openPositions = TraderPool(address(this)).openPositions();

        poolInfo.baseAndPositionBalances = new uint256[](poolInfo.openPositions.length + 1);
        poolInfo.baseAndPositionBalances[0] = poolInfo.parameters.baseToken.normThisBalance();

        for (uint256 i = 0; i < poolInfo.openPositions.length; i++) {
            poolInfo.baseAndPositionBalances[i + 1] = poolInfo.openPositions[i].normThisBalance();
        }

        poolInfo.totalBlacklistedPositions = positions.length() - poolInfo.openPositions.length;
        poolInfo.totalInvestors = TraderPool(address(this)).totalInvestors();

        (poolInfo.totalPoolBase, poolInfo.totalPoolUSD) = poolParameters
            .getNormalizedPoolPriceAndUSD();

        poolInfo.lpSupply = IERC20(address(this)).totalSupply();
        poolInfo.lpLockedInProposals =
            TraderPool(address(this)).totalEmission() -
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

    function getLeverageInfo(
        ITraderPool.PoolParameters storage poolParameters
    ) external view returns (ITraderPool.LeverageInfo memory leverageInfo) {
        (
            leverageInfo.totalPoolUSDWithProposals,
            leverageInfo.traderLeverageUSDTokens
        ) = poolParameters.getMaxTraderLeverage();

        if (leverageInfo.traderLeverageUSDTokens > leverageInfo.totalPoolUSDWithProposals) {
            leverageInfo.freeLeverageUSD =
                leverageInfo.traderLeverageUSDTokens -
                leverageInfo.totalPoolUSDWithProposals;
            (leverageInfo.freeLeverageBase, ) = TraderPool(address(this))
                .priceFeed()
                .getNormalizedPriceInUSD(poolParameters.baseToken, leverageInfo.freeLeverageUSD);
        }
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
            IPriceFeed priceFeed = TraderPool(address(this)).priceFeed();

            receptions.baseAmount = currentBaseAmount.ratio(amountInBaseToInvest, totalBase);
            receptions.lpAmount = receptions.lpAmount.ratio(
                IERC20(address(this)).totalSupply(),
                totalBase
            );

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
    }

    function getInvestInitialTokens(
        ITraderPool.PoolParameters storage poolParameters,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external view returns (uint256 lpAmount) {
        TraderPool traderPool = TraderPool(address(this));
        address baseToken = poolParameters.baseToken;

        (uint256 totalBase, , , ) = poolParameters.getNormalizedPoolPriceAndPositions();

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 baseAmount;
            if (tokens[i] != baseToken) {
                (baseAmount, ) = traderPool.priceFeed().getNormalizedPriceOut(
                    tokens[i],
                    baseToken,
                    amounts[i]
                );
            } else {
                baseAmount = amounts[i];
            }

            lpAmount += baseAmount;
        }

        if (totalBase > 0) {
            lpAmount = lpAmount.ratio(traderPool.totalSupply(), totalBase);
        }
    }

    function getReinvestCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        uint256[] calldata offsetLimits
    ) external view returns (ITraderPool.Commissions memory commissions) {
        (uint256 totalPoolBase, ) = poolParameters.getNormalizedPoolPriceAndUSD();
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = 0; i < offsetLimits.length; i += 2) {
            uint256 to = (offsetLimits[i] + offsetLimits[i + 1]).min(investors.length()).max(
                offsetLimits[i]
            );

            for (uint256 j = offsetLimits[i]; j < to; j++) {
                address investor = investors.at(j);

                (uint256 baseCommission, uint256 lpCommission) = _getReinvestCommission(
                    poolParameters,
                    investor,
                    totalPoolBase,
                    totalSupply
                );

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
        IPriceFeed priceFeed = TraderPool(address(this)).priceFeed();
        address[] memory openPositions = TraderPool(address(this)).openPositions();

        uint256 totalSupply = IERC20(address(this)).totalSupply();

        receptions.positions = new address[](openPositions.length);
        receptions.givenAmounts = new uint256[](openPositions.length);
        receptions.receivedAmounts = new uint256[](openPositions.length);

        if (totalSupply > 0) {
            receptions.baseAmount = baseToken
                .balanceOf(address(this))
                .ratio(amountLP, totalSupply)
                .to18(baseToken.decimals());

            for (uint256 i = 0; i < openPositions.length; i++) {
                receptions.positions[i] = openPositions[i];
                receptions.givenAmounts[i] = ERC20(receptions.positions[i])
                    .balanceOf(address(this))
                    .ratio(amountLP, totalSupply)
                    .to18(ERC20(receptions.positions[i]).decimals());

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

    function _getUserInfo(
        ITraderPool.PoolParameters storage poolParameters,
        address user,
        uint256 totalPoolBase,
        uint256 totalPoolUSD,
        uint256 totalSupply
    ) internal view returns (ITraderPool.UserInfo memory userInfo) {
        ICoreProperties coreProperties = TraderPool(address(this)).coreProperties();

        userInfo.poolLPBalance = IERC20(address(this)).balanceOf(user);

        if (userInfo.poolLPBalance > 0) {
            (userInfo.investedBase, userInfo.commissionUnlockTimestamp) = TraderPool(address(this))
                .investorsInfo(user);

            userInfo.poolUSDShare = totalPoolUSD.ratio(userInfo.poolLPBalance, totalSupply);
            userInfo.poolBaseShare = totalPoolBase.ratio(userInfo.poolLPBalance, totalSupply);

            if (userInfo.commissionUnlockTimestamp > 0) {
                (userInfo.owedBaseCommission, userInfo.owedLPCommission) = poolParameters
                    .calculateCommissionOnDivest(
                        user,
                        userInfo.poolBaseShare,
                        userInfo.poolLPBalance
                    );
            }
        }

        userInfo.commissionUnlockTimestamp = userInfo.commissionUnlockTimestamp == 0
            ? coreProperties.getCommissionEpochByTimestamp(
                block.timestamp,
                poolParameters.commissionPeriod
            )
            : userInfo.commissionUnlockTimestamp;

        userInfo.commissionUnlockTimestamp = coreProperties.getCommissionTimestampByEpoch(
            userInfo.commissionUnlockTimestamp,
            poolParameters.commissionPeriod
        );
    }

    function _getReinvestCommission(
        ITraderPool.PoolParameters storage poolParameters,
        address investor,
        uint256 totalPoolBase,
        uint256 totalSupply
    ) internal view returns (uint256 baseCommission, uint256 lpCommission) {
        (, uint256 commissionUnlockEpoch) = TraderPool(address(this)).investorsInfo(investor);

        if (poolParameters.getNextCommissionEpoch() > commissionUnlockEpoch) {
            uint256 lpBalance = IERC20(address(this)).balanceOf(investor);
            uint256 baseShare = totalPoolBase.ratio(lpBalance, totalSupply);

            (baseCommission, lpCommission) = poolParameters.calculateCommissionOnDivest(
                investor,
                baseShare,
                lpBalance
            );
        }
    }

    function _getTraderAndPlatformCommissions(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseCommission,
        uint256 lpCommission
    ) internal view returns (ITraderPool.Commissions memory commissions) {
        IPriceFeed priceFeed = TraderPool(address(this)).priceFeed();
        (uint256 dexePercentage, , , ) = TraderPool(address(this))
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
}
