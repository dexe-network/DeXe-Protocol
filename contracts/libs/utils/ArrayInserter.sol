// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library ArrayInserter {
    function insert(
        uint256[] memory to,
        uint256 index,
        uint256[] memory what
    ) internal pure returns (uint256) {
        for (uint256 i = 0; i < what.length; i++) {
            to[index + i] = what[i];
        }

        return index + what.length;
    }

    function insert(
        address[] memory to,
        uint256 index,
        address[] memory what
    ) internal pure returns (uint256) {
        for (uint256 i = 0; i < what.length; i++) {
            to[index + i] = what[i];
        }

        return index + what.length;
    }
}
