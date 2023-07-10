// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library ArrayCropper {
    /**
     * @dev decrease uint256 array length
     */
    function crop(
        uint256[] memory arr,
        uint256 newLength
    ) internal pure returns (uint256[] memory) {
        require(newLength <= arr.length, "ArrayCropper: expanding is not possible");

        assembly {
            mstore(arr, newLength)
        }

        return arr;
    }

    /**
     * @dev decrease address array length
     */
    function crop(
        address[] memory arr,
        uint256 newLength
    ) internal pure returns (address[] memory) {
        require(newLength <= arr.length, "ArrayCropper: expanding is not possible");

        assembly {
            mstore(arr, newLength)
        }

        return arr;
    }
}
