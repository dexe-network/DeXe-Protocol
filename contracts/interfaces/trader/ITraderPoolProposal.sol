// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPoolProposal {
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint256 baseTokenDecimals;
    }

    function totalLockedLP() external view returns (uint256);

    function totalBalanceBase() external view returns (uint256);

    function totalLPBalances(address user) external view returns (uint256);

    function getBalanceBaseInDAI() external view returns (uint256);
}
