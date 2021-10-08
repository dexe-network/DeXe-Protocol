// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IPriceFeed {
    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) external view returns (uint256);

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external returns (uint256);
}
