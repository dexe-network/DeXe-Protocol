// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/ICoreProperties.sol";
import "../../interfaces/core/IPriceFeed.sol";

import "../../trader/TraderPool.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

library TraderPoolCommission {
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using SafeERC20 for IERC20;
    using TokenBalance for address;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    event CommissionClaimed(address sender, uint256 traderLpClaimed, uint256 traderBaseClaimed);

    function reinvestCommission(
        mapping(address => ITraderPool.InvestorInfo) storage investorsInfo,
        EnumerableSet.AddressSet storage investors,
        uint256[] calldata offsetLimits,
        uint256 minDexeCommissionOut,
        ITraderPool.PoolParameters storage poolParameters
    ) external {
        require(TraderPool(address(this)).openPositions().length == 0, "TP: positions are open");

        uint256 totalSupply = TraderPool(address(this)).totalSupply();
        uint256 nextCommissionEpoch = getNextCommissionEpoch(poolParameters);
        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = 0; i < offsetLimits.length; i += 2) {
            uint256 to = (offsetLimits[i] + offsetLimits[i + 1]).min(investors.length()).max(
                offsetLimits[i]
            );

            for (uint256 j = offsetLimits[i]; j < to; j++) {
                address investor = investors.at(j);
                ITraderPool.InvestorInfo storage info = investorsInfo[investor];

                if (nextCommissionEpoch > info.commissionUnlockEpoch) {
                    (
                        uint256 investorBaseAmount,
                        uint256 baseCommission,
                        uint256 lpCommission
                    ) = calculateCommissionOnReinvest(poolParameters, investor, totalSupply);

                    info.commissionUnlockEpoch = nextCommissionEpoch;

                    if (lpCommission > 0) {
                        info.investedBase = investorBaseAmount - baseCommission;

                        TraderPool(address(this)).burn(investor, lpCommission);

                        allBaseCommission += baseCommission;
                        allLPCommission += lpCommission;
                    }
                }
            }
        }

        distributeCommission(
            poolParameters,
            allBaseCommission,
            allLPCommission,
            minDexeCommissionOut
        );
    }

    function distributeCommission(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 minDexeCommissionOut
    ) public {
        require(baseToDistribute > 0, "TP: no commission available");

        TraderPool traderPool = TraderPool(address(this));
        IERC20 dexeToken = traderPool.dexeToken();

        (
            uint256 dexePercentage,
            ,
            uint256[] memory poolPercentages,
            address[3] memory commissionReceivers
        ) = traderPool.coreProperties().getDEXECommissionPercentages();

        (uint256 dexeLPCommission, uint256 dexeBaseCommission) = calculateDexeCommission(
            baseToDistribute,
            lpToDistribute,
            dexePercentage
        );
        uint256 dexeCommission = traderPool.priceFeed().normalizedExchangeFromExact(
            poolParameters.baseToken,
            address(dexeToken),
            dexeBaseCommission,
            new address[](0),
            minDexeCommissionOut
        );

        traderPool.mint(poolParameters.trader, lpToDistribute - dexeLPCommission);

        for (uint256 i = 0; i < commissionReceivers.length; i++) {
            dexeToken.safeTransfer(
                commissionReceivers[i],
                dexeCommission.percentage(poolPercentages[i])
            );
        }

        emit CommissionClaimed(
            msg.sender,
            lpToDistribute - dexeLPCommission,
            baseToDistribute - dexeBaseCommission
        );
    }

    function calculateCommissionOnReinvest(
        ITraderPool.PoolParameters storage poolParameters,
        address investor,
        uint256 oldTotalSupply
    )
        public
        view
        returns (uint256 investorBaseAmount, uint256 baseCommission, uint256 lpCommission)
    {
        uint256 investorBalance = IERC20(address(this)).balanceOf(investor);
        uint256 baseTokenBalance = poolParameters.baseToken.normThisBalance();

        investorBaseAmount = baseTokenBalance.ratio(investorBalance, oldTotalSupply);

        (baseCommission, lpCommission) = calculateCommissionOnDivest(
            poolParameters,
            investor,
            investorBaseAmount,
            investorBalance
        );
    }

    function calculateCommissionOnDivest(
        ITraderPool.PoolParameters storage poolParameters,
        address investor,
        uint256 investorBaseAmount,
        uint256 amountLP
    ) public view returns (uint256 baseCommission, uint256 lpCommission) {
        uint256 balance = IERC20(address(this)).balanceOf(investor);

        if (balance > 0) {
            (uint256 investedBase, ) = TraderPool(address(this)).investorsInfo(investor);
            investedBase = investedBase.ratio(amountLP, balance);

            (baseCommission, lpCommission) = _calculateInvestorCommission(
                poolParameters,
                investorBaseAmount,
                amountLP,
                investedBase
            );
        }
    }

    function getNextCommissionEpoch(
        ITraderPool.PoolParameters storage poolParameters
    ) public view returns (uint256) {
        return
            TraderPool(address(this)).coreProperties().getCommissionEpochByTimestamp(
                block.timestamp,
                poolParameters.commissionPeriod
            );
    }

    function calculateDexeCommission(
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 dexePercentage
    ) public pure returns (uint256 lpCommission, uint256 baseCommission) {
        lpCommission = lpToDistribute.percentage(dexePercentage);
        baseCommission = baseToDistribute.percentage(dexePercentage);
    }

    function _calculateInvestorCommission(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 investorBaseAmount,
        uint256 investorLPAmount,
        uint256 investedBaseAmount
    ) internal view returns (uint256 baseCommission, uint256 lpCommission) {
        if (investorBaseAmount > investedBaseAmount) {
            baseCommission = (investorBaseAmount - investedBaseAmount).percentage(
                poolParameters.commissionPercentage
            );
            lpCommission = investorLPAmount.ratio(baseCommission, investorBaseAmount);
        }
    }
}
