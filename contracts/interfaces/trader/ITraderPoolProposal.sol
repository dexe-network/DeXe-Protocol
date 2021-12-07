// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPoolProposal {
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint256 baseTokenDecimals;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function totalLockedLP() external view returns (uint256);

    function totalInvestedBase() external view returns (uint256);

    function totalLPInvestments(address user) external view returns (uint256);
}
