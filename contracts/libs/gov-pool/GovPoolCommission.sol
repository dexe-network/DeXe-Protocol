// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";

import "../../gov/GovPool.sol";

library GovPoolCommission {
    using MathHelper for uint256;
    using Math for uint256;
    using TokenBalance for address;

    function payCommission(address rewardToken, uint256 commissionAmount) internal {
        GovPool govPool = GovPool(payable(address(this)));

        (, uint256 commissionPercentage, , address[3] memory commissionReceivers) = govPool
            .coreProperties()
            .getDEXECommissionPercentages();

        address insuranceCommissionReceiver = commissionReceivers[1];

        if (rewardToken == address(0) || insuranceCommissionReceiver == address(this)) {
            return;
        }

        uint256 commission = rewardToken.normThisBalance().min(
            commissionAmount.percentage(commissionPercentage)
        );

        rewardToken.sendFunds(insuranceCommissionReceiver, commission, true);
    }
}
