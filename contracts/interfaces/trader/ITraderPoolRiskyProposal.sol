// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolProposal.sol";

interface ITraderPoolRiskyProposal is ITraderPoolProposal {
    struct ProposalLimits {
        uint256 timestampLimit;
        uint256 investLPLimit;
        uint256 maxTokenPriceLimit;
    }

    struct ProposalInfo {
        address token;
        uint256 tokenDecimals;
        ProposalLimits proposalLimits;
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

    function __TraderPoolRiskyProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external;

    function createProposal(
        address token,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        address[] calldata optionalPath,
        uint256 minPositionOut
    ) external;

    function investProposal(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 minPositionOut
    ) external;

    function divestProposal(
        uint256 proposalId,
        address user,
        uint256 lp2,
        uint256 minPositionOut
    ) external returns (uint256);

    function divestAllProposals(address user, uint256[] calldata minPositionsOut)
        external
        returns (uint256);

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath,
        uint256 minAmountOut
    ) external;
}
