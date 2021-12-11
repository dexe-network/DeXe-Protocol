// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library ArrayHelper {
    function reverse(address[] memory arr) internal pure returns (address[] memory reversed) {
        reversed = new address[](arr.length);
        uint256 i = arr.length;

        while (i > 0) {
            i--;
            reversed[arr.length - 1 - i] = arr[i];
        }
    }
}
