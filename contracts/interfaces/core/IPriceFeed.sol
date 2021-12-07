// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IPriceFeed {
    function getPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) external view returns (uint256);

    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amount
    ) external view returns (uint256);

    function getPriceInDAI(address inToken, uint256 amount) external view returns (uint256);

    function getNormalizedPriceInDAI(address inToken, uint256 amount)
        external
        view
        returns (uint256);

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external returns (uint256);

    function normalizedExchangeTo(
        address inToken,
        address outToken,
        uint256 amount
    ) external returns (uint256);

    function isSupportedBaseToken(address token) external view returns (bool);
}
