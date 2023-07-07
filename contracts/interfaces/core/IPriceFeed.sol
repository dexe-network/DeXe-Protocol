// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

/**
 * This is the price feed contract which is used to fetch the spot prices from the UniswapV2 protocol + execute swaps
 * on its pairs. The protocol does not require price oracles to be secure and reliable. There also is a pathfinder
 * built into the contract to find the optimal* path between the pairs
 */
interface IPriceFeed {
    /// @notice A struct this is returned from the UniswapV2PathFinder library when an optimal* path is found
    /// @param path the optimal* path itself
    /// @param amounts either the "amounts out" or "amounts in" required
    /// @param withProvidedPath a bool flag saying if the path is found via the specified path
    struct FoundPath {
        address[] path;
        uint256[] amounts;
        bool withProvidedPath;
    }

    /// @notice The function to initialize the contract
    function __PriceFeed_init() external;

    /// @notice This function sets path tokens that will be used in the pathfinder
    /// @param pathTokens the array of tokens to be added into the path finder
    function addPathTokens(address[] calldata pathTokens) external;

    /// @notice This function removes path tokens from the pathfinder
    /// @param pathTokens the array of tokens to be removed from the pathfinder
    function removePathTokens(address[] calldata pathTokens) external;

    /// @notice The function that performs an actual Uniswap swap (swapExactTokensForTokens),
    /// taking the amountIn inToken tokens from the msg.sender and sending not less than minAmountOut outTokens back.
    /// The approval of amountIn tokens has to be made to this address beforehand
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

    /// @notice The function that performs an actual Uniswap swap (swapTokensForExactTokens),
    /// taking not more than maxAmountIn inToken tokens from the msg.sender and sending amountOut outTokens back.
    /// The approval of maxAmountIn tokens has to be made to this address beforehand
    /// @param inToken the token to be exchanged from
    /// @param outToken the token to be exchanged to
    /// @param amountOut the amount of outToken tokens to be received
    /// @param optionalPath the optional path that will be considered by the pathfinder to find the best route
    /// @param maxAmountIn the maximal amount of inTokens that have to be taken to execute the swap.
    /// basically this is a sandwich attack protection mechanism
    /// @return the amount of inTokens taken from the msg.sender
    function exchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) external returns (uint256);

    /// @notice The same as "exchangeFromExact" except that the amount of inTokens and received amount of outTokens is normalized
    /// @param inToken the token to be exchanged from
    /// @param outToken the token to be exchanged to
    /// @param amountIn the amount of inTokens to be exchanged (in 18 decimals)
    /// @param optionalPath the optional path that will be considered by the pathfinder
    /// @param minAmountOut the minimal amount of outTokens to be received (also normalized)
    /// @return normalized amount of outTokens sent to the msg.sender after the swap
    function normalizedExchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external returns (uint256);

    /// @notice The same as "exchangeToExact" except that the amount of inTokens and received amount of outTokens is normalized
    /// @param inToken the token to be exchanged from
    /// @param outToken the token to be exchanged to
    /// @param amountOut the amount of outTokens to be received (in 18 decimals)
    /// @param optionalPath the optional path that will be considered by the pathfinder
    /// @param maxAmountIn the maximal amount of inTokens to be taken (also normalized)
    /// @return normalized amount of inTokens taken from the msg.sender to execute the swap
    function normalizedExchangeToExact(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] calldata optionalPath,
        uint256 maxAmountIn
    ) external returns (uint256);

    /// @notice The function that return address of the UniswapV2Factory contract
    /// @return the address of the UniswapV2Factory contract
    function uniswapFactory() external view returns (IUniswapV2Factory);

    /// @notice The function that return address of the UniswapV2Router02 contract
    /// @return the address of the UniswapV2Router02 contract
    function uniswapV2Router() external view returns (IUniswapV2Router02);

    /// @notice This function tries to find the optimal exchange rate (the price) between "inToken" and "outToken" using
    /// custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of
    /// outTokens is maximal
    /// @param inToken the token to exchange from
    /// @param outToken the received token
    /// @param amountIn the amount of inToken to be exchanged (in inToken decimals)
    /// @param optionalPath the optional path between inToken and outToken that will be used in the pathfinder
    /// @return amountOut amount of outToken after the swap (in outToken decimals)
    /// @return path the tokens path that will be used during the swap
    function getExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) external view returns (uint256 amountOut, address[] memory path);

    /// @notice This function tries to find the optimal exchange rate (the price) between "inToken" and "outToken" using
    /// custom pathfinder, saved paths and optional specified path. The optimality is reached when the amount of
    /// inTokens is minimal
    /// @param inToken the token to exchange from
    /// @param outToken the received token
    /// @param amountOut the amount of outToken to be received (in inToken decimals)
    /// @param optionalPath the optional path between inToken and outToken that will be used in the pathfinder
    /// @return amountIn amount of inToken to execute a swap (in outToken decimals)
    /// @return path the tokens path that will be used during the swap
    function getExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) external view returns (uint256 amountIn, address[] memory path);

    /// @notice Shares the same functionality as "getExtendedPriceOut" function with automatic usage of saved paths.
    /// It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals
    /// @param inToken the token to exchange from
    /// @param outToken the token to exchange to
    /// @param amountIn the amount of inToken to be exchanged (with 18 decimals)
    /// @return amountOut the received amount of outToken after the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, address[] memory path);

    /// @notice Shares the same functionality as "getExtendedPriceIn" function with automatic usage of saved paths.
    /// It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals
    /// @param inToken the token to exchange from
    /// @param outToken the token to exchange to
    /// @param amountOut the amount of outToken to be received (with 18 decimals)
    /// @return amountIn required amount of inToken to execute the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut
    ) external view returns (uint256 amountIn, address[] memory path);

    /// @notice Shares the same functionality as "getExtendedPriceOut" function.
    /// It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals
    /// @param inToken the token to exchange from
    /// @param outToken the token to exchange to
    /// @param amountIn the amount of inToken to be exchanged (with 18 decimals)
    /// @param optionalPath the optional path between inToken and outToken that will be used in the pathfinder
    /// @return amountOut the received amount of outToken after the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedExtendedPriceOut(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath
    ) external view returns (uint256 amountOut, address[] memory path);

    /// @notice Shares the same functionality as "getExtendedPriceIn" function.
    /// It accepts and returns amounts with 18 decimals regardless of the inToken and outToken decimals
    /// @param inToken the token to exchange from
    /// @param outToken the token to exchange to
    /// @param amountOut the amount of outToken to be received (with 18 decimals)
    /// @param optionalPath the optional path between inToken and outToken that will be used in the pathfinder
    /// @return amountIn the required amount of inToken to execute the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedExtendedPriceIn(
        address inToken,
        address outToken,
        uint256 amountOut,
        address[] memory optionalPath
    ) external view returns (uint256 amountIn, address[] memory path);

    /// @notice The same as "getPriceOut" with "outToken" being native USD token
    /// @param inToken the token to be exchanged from
    /// @param amountIn the amount of inToken to exchange (with 18 decimals)
    /// @return amountOut the received amount of native USD tokens after the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceOutUSD(
        address inToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, address[] memory path);

    /// @notice The same as "getPriceIn" with "outToken" being USD token
    /// @param inToken the token to get the price of
    /// @param amountOut the amount of USD to be received (with 18 decimals)
    /// @return amountIn the required amount of inToken to execute the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceInUSD(
        address inToken,
        uint256 amountOut
    ) external view returns (uint256 amountIn, address[] memory path);

    /// @notice The same as "getPriceOut" with "outToken" being DEXE token
    /// @param inToken the token to be exchanged from
    /// @param amountIn the amount of inToken to exchange (with 18 decimals)
    /// @return amountOut the received amount of DEXE tokens after the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceOutDEXE(
        address inToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, address[] memory path);

    /// @notice The same as "getPriceIn" with "outToken" being DEXE token
    /// @param inToken the token to get the price of
    /// @param amountOut the amount of DEXE to be received (with 18 decimals)
    /// @return amountIn the required amount of inToken to execute the swap (with 18 decimals)
    /// @return path the tokens path that will be used during the swap
    function getNormalizedPriceInDEXE(
        address inToken,
        uint256 amountOut
    ) external view returns (uint256 amountIn, address[] memory path);

    /// @notice The function that returns the total number of path tokens (tokens used in the pathfinder)
    /// @return the number of path tokens
    function totalPathTokens() external view returns (uint256);

    /// @notice The function to get the list of path tokens
    /// @return the list of path tokens
    function getPathTokens() external view returns (address[] memory);

    /// @notice The function to get the list of saved tokens of the pool
    /// @param pool the address the path is saved for
    /// @param from the from token (path beginning)
    /// @param to the to token (path ending)
    /// @return the array of addresses representing the inclusive path between tokens
    function getSavedPaths(
        address pool,
        address from,
        address to
    ) external view returns (address[] memory);

    /// @notice This function checks if the provided token is used by the pathfinder
    /// @param token the token to be checked
    /// @return true if the token is used by the pathfinder, false otherwise
    function isSupportedPathToken(address token) external view returns (bool);
}
