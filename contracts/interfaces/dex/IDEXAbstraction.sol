// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IDEXAbstraction {
    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external returns (uint256);
}
