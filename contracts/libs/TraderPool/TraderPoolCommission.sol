// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/trader/ITraderPool.sol";
import "../../interfaces/core/ICoreProperties.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "../../libs/DecimalsConverter.sol";
import "../../libs/MathHelper.sol";

library TraderPoolCommission {
    using DecimalsConverter for uint256;
    using MathHelper for uint256;
    using TraderPoolPrice for ITraderPool.PoolParameters;
    using TraderPoolPrice for address;

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
        uint256 baseTokenBalance = poolParameters.baseToken.getNormalizedBalance();

        investorBaseAmount = baseTokenBalance.ratio(investorBalance, oldTotalSupply);
        (uint256 investedBase, ) = TraderPool(address(this)).investorsInfo(investor);

        (baseCommission, lpCommission) = _calculateInvestorCommission(
            poolParameters,
            investorBaseAmount,
            investorBalance,
            investedBase
        );
    }

    function calculateCommissionOnDivest(
        ITraderPool.PoolParameters storage poolParameters,
        address investor,
        uint256 investorBaseAmount,
        uint256 amountLP
    ) external view returns (uint256 baseCommission, uint256 lpCommission) {
        (uint256 investedBase, ) = TraderPool(address(this)).investorsInfo(investor);
        investedBase = investedBase.ratio(amountLP, IERC20(address(this)).balanceOf(investor));

        (baseCommission, lpCommission) = _calculateInvestorCommission(
            poolParameters,
            investorBaseAmount,
            amountLP,
            investedBase
        );
    }

    function calculateDexeCommission(
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 dexePercentage
    ) external pure returns (uint256 lpCommission, uint256 baseCommission) {
        lpCommission = lpToDistribute.percentage(dexePercentage);
        baseCommission = baseToDistribute.percentage(dexePercentage);
    }
}
