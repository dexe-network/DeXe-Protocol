// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the price feed contract which is used to fetch the spot price from the UniswapV2 propotol + execute swaps
 * on its pairs. The propotol does not require price oracles to still be secure and reliable. There only is a pathfinder
 * built into the contract
 */
interface IPriceFeed {
    function setPathTokens(address[] calldata pathTokens) external;

    function removePathTokens(address[] calldata pathTokens) external;

    function addSupportedBaseTokens(address[] calldata baseTokens) external;

    function removeSupportedBaseTokens(address[] calldata baseTokens) external;

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amount,
        address[] memory optionalPath
    ) external view returns (uint256);

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

    function getPriceInDEXE(address inToken, uint256 amount) external view returns (uint256);

    function getPriceInUSD(address inToken, uint256 amount) external view returns (uint256);

    function getNormalizedPriceInUSD(address inToken, uint256 amount)
        external
        view
        returns (uint256);

    function exchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external returns (uint256);

    function normalizedExchangeTo(
        address inToken,
        address outToken,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external returns (uint256);

    function isSupportedBaseToken(address token) external view returns (bool);

    function isSupportedPathToken(address token) external view returns (bool);
}
