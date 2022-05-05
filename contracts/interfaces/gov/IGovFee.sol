// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovFee {
    /**
     * @notice Withdraw fee
     * @param tokenAddress ERC20 token address or zero address for native withdraw
     * @param recipient Tokens recipient
     */
    function withdrawFee(address tokenAddress, address recipient) external;
}
