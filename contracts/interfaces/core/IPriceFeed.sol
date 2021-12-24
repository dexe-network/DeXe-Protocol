// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the price feed contract which is used to fetch the spot prices from the UniswapV2 propotol + execute swaps
 * on its pairs. The propotol does not require price oracles to be secure and reliable. There also is a pathfinder
 * built into the contract to find the optimal* path between the pairs
 */
interface IPriceFeed {
    struct FoundPath {
        address[] path;
        uint256[] amounts;
        bool withSavedPath;
    }

    /// @notice This function sets path tokens that will be used in the pathfinder
    /// @param pathTokens the array of tokens to be added into the path finder
    function setPathTokens(address[] calldata pathTokens) external;

    /// @notice This function removes path tokens from the pathfinder
    /// @param pathTokens the array of tokens to be removed from the pathfinder
    function removePathTokens(address[] calldata pathTokens) external;

    /// @notice This function adds new tokens that will be made available for the TraderPool basetokens usage
    /// @param baseTokens the array of tokens to be whitelisted
    function addSupportedBaseTokens(address[] calldata baseTokens) external;

    /// @notice This function removes tokens from the basetokens list, it does nothing with already created pools
    /// @param baseTokens basetokens to be removed
    function removeSupportedBaseTokens(address[] calldata baseTokens) external;

    /// @notice This function tries to find the optimal exchange rate (the price) between "inToken" and "outToken" using
    /// custom pathfinder, saved paths and optional specified path
    /// @param inToken the token to start exchange from
    /// @param outToken the received token
    /// @param amountIn the amount of inToken to be excanged (in inToken decimals)
    /// @param optionalPath the optional path between inToken and outToken that will be used in the pathfinder
    /// @return received amount of outToken after the swap (in outToken decimals)
    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) external view returns (uint256);

    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) external view returns (uint256);

    /// @notice Shares the same functionality as "getPriceIn" function, however it accepts and returns amount with 18 decimals
    /// regardless of the inToken and outToken decimals
    /// @param inToken the token to exchange from
    /// @param outToken the token to exchange to
    /// @param amountIn the amount of inToken (with 18 decimals)
    /// @return the amount of outToken after the swap (with 18 decimals)
    function getNormalizedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn
    ) external view returns (uint256);

    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut
    ) external view returns (uint256);

    function getNormalizedExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) external view returns (uint256);

    function getNormalizedExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) external view returns (uint256);

    /// @notice The same as "getPriceOut" with "outToken" being DEXE token
    /// @param inToken the token to be exchanged from
    /// @param amountIn the amount of inToken to exchange (with 18 decimals)
    /// @return received amount of DEXE tokens after the swap (with 18 decimals)
    function getNormalizedPriceOutDEXE(address inToken, uint256 amountIn)
        external
        view
        returns (uint256);

    /// @notice The same as "getPriceOut" with "outToken" being native USD token
    /// @param inToken the token to be exchanged from
    /// @param amountIn the amount of inToken to exchange (with 18 decimals)
    /// @return received amount of native USD tokens after the swap (with 18 decimals)
    function getNormalizedPriceOutUSD(address inToken, uint256 amountIn)
        external
        view
        returns (uint256);

    /// @notice The function that performs an actual Uniswap swap, taking the inToken tokens from the msg.sender
    /// and sending received outTokens back. The approval to this address has to be made beforehand
    /// @param inToken the token to be exchanged from
    /// @param outToken the token to be exchanged to
    /// @param amountIn the amount of inToken tokens to be exchanged
    /// @param optionalPath the optional path that will be considered by the pathfinder to find the best route
    /// @param minAmountOut the minimal amount of outToken tokens that have to be received after the swap.
    /// basically this is a sandwich attack protection mechanism
    /// @return the amount of outToken tokens sent to the msg.sender after the swap
    function exchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external returns (uint256);

    function exchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) external returns (uint256);

    /// @notice The same as "exchangeTo" except that the amount of inTokens and received amount of outTokens is normalized
    /// @param inToken the token to be exchanged from
    /// @param outToken the token to be exchanged to
    /// @param amountIn the amount of inTokens to be exchanged (in 18 decimals)
    /// @param optionalPath the optional path that will be considered by the pathfinder
    /// @param minAmountOut the minimal amount of outTokens to be received. Note that this parameter is NOT normalized
    /// @return normalized amount of outTokens sent to the msg.sender after the swap
    function normalizedExchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external returns (uint256);

    function normalizedExchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) external returns (uint256);

    /// @notice This function checks if the provided token can be used as a base token
    /// @param token the token to be checked
    /// @return true if the token can be used as a base token, false otherwise
    function isSupportedBaseToken(address token) external view returns (bool);

    /// @notice This function checks if the provided token is used by the pathfinder
    /// @param token the token to be checked
    /// @return true if the token is used by the pathfinder, false otherwise
    function isSupportedPathToken(address token) external view returns (bool);
}
