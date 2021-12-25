// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "./TraderPoolPrice.sol";
import "../../libs/DecimalsConverter.sol";
import "../../libs/MathHelper.sol";

library TraderPoolCommission {
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using TraderPoolPrice for ITraderPool.PoolParameters;

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

            lpCommission = (investorLPAmount * baseCommission) / investorBaseAmount;
        }
    }

    function nextCommissionEpoch(ITraderPool.PoolParameters storage poolParameters)
        public
        view
        returns (uint256)
    {
        return
            ITraderPool(address(this)).coreProperties().getCommissionEpoch(
                block.timestamp,
                poolParameters.commissionPeriod
            );
    }

    function calculateCommissionOnReinvest(
        ITraderPool.PoolParameters storage poolParameters,
        ITraderPool.InvestorInfo storage investorInfo,
        address investor,
        uint256 oldTotalSupply
    )
        external
        view
        returns (
            uint256 investorBaseAmount,
            uint256 baseCommission,
            uint256 lpCommission
        )
    {
        uint256 investorBalance = IERC20(address(this)).balanceOf(investor);
        uint256 baseTokenBalance = poolParameters.getNormalizedBaseInPool();

        investorBaseAmount = baseTokenBalance.ratio(investorBalance, oldTotalSupply);

        (baseCommission, lpCommission) = _calculateInvestorCommission(
            poolParameters,
            investorBaseAmount,
            investorBalance,
            investorInfo.investedBase
        );
    }

    function calculateCommissionOnDivest(
        ITraderPool.PoolParameters storage poolParameters,
        ITraderPool.InvestorInfo storage investorInfo,
        address investor,
        uint256 investorBaseAmount,
        uint256 amountLP
    ) external view returns (uint256 baseCommission, uint256 lpCommission) {
        uint256 investedBaseConverted = investorInfo.investedBase.ratio(
            amountLP,
            IERC20(address(this)).balanceOf(investor)
        );

        (baseCommission, lpCommission) = _calculateInvestorCommission(
            poolParameters,
            investorBaseAmount,
            amountLP,
            investedBaseConverted
        );
    }

    function calculateDexeCommission(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 dexePercentage
    ) external view returns (uint256 lpCommission, uint256 baseCommission) {
        lpCommission = lpToDistribute.percentage(dexePercentage);
        baseCommission = baseToDistribute.percentage(dexePercentage).convertFrom18(
            poolParameters.baseTokenDecimals
        );
    }
}
