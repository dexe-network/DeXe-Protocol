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

    function investedBase() external view returns (uint256);

    function totalLPBalances(address user) external view returns (uint256);

    function getInvestedBaseInUSD() external view returns (uint256);
}
