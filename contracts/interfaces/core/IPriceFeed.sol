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

    function getPriceInUSD(address inToken, uint256 amount) external view returns (uint256);

    function getNormalizedPriceInUSD(address inToken, uint256 amount)
        external
        view
        returns (uint256);

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] memory optionalPath,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256);

    function normalizedExchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] memory optionalPath,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256);

    function isSupportedBaseToken(address token) external view returns (bool);

    function isSupportedPathToken(address token) external view returns (bool);
}
