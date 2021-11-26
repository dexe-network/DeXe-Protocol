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

    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lpInvested;
        uint256 baseShare;
        uint256 positionShare;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function totalLockedLP() external view returns (uint256);

    function totalInvestedBase() external view returns (uint256);

    function totalLPInvestments(address user) external view returns (uint256);

    function createProposal(
        address token,
        uint256 timestampLimit,
        uint256 investLPLimit,
        uint256 maxTokenPriceLimit,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage
    ) external;

    function investProposal(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external;

    function divestProposal(
        uint256 proposalId,
        address user,
        uint256 lp2
    ) external returns (uint256);

    function divestAllProposals(address user) external returns (uint256);

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount
    ) external;
}
