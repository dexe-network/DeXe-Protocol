// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IPriceFeed {
    function getPriceIn(
        uint256 amount,
        address inToken,
        address outToken
    ) external view returns (uint256);

    function getPriceInDAI(uint256 amount, address inToken) external view returns (uint256);

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external returns (uint256);
}
