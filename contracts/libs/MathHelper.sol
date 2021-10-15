// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/Globals.sol";

library MathHelper {
    function percentage(uint256 num, uint256 percent) internal returns (uint256) {
        return (num * percent) / PERCENTAGE_100;
    }
}
