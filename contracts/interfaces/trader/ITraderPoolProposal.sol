// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPoolProposal {
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint256 baseTokenDecimals;
    }

    struct ProposalInfo {
        address token;
        uint256 tokenDecimals;
        uint256 timestampLimit;
        uint256 investLPLimit;
        uint256 maxTokenPriceLimit;
        uint256 investedLP;
        uint256 balanceBase;
        uint256 balancePosition;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function totalLockedLP() external view returns (uint256);

    function totalInvestedBase() external view returns (uint256);

    function totalLPInvestments(address user) external view returns (uint256);
}
