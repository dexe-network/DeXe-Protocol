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
        uint256 lp2Balance;
        uint256 lpInvested;
        uint256 baseShare;
        uint256 positionShare;
    }

    struct Receptions {
        uint256 baseAmount;
        address[] positions;
        uint256[] receivedBaseAmounts; // should be used as minAmountOut
        uint256[] receivedPositionAmounts; // should be used as minAmountOut
    }

    function __TraderPoolRiskyProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external;

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalInfo[] memory proposals);

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments);

    function create(
        address token,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        uint256 minPositionOut,
        address[] calldata optionalPath
    ) external;

    function getCreationTokens(
        address token,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        address[] calldata optionalPath
    ) external view returns (uint256);

    function getInvestTokens(uint256 proposalId, uint256 baseInvestment)
        external
        view
        returns (uint256 baseAmount, uint256 positionAmount);

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 minPositionOut
    ) external;

    function getDivestAmounts(uint256[] calldata proposalIds, uint256[] calldata lp2s)
        external
        view
        returns (Receptions memory receptions);

    function divest(
        uint256 proposalId,
        address user,
        uint256 lp2,
        uint256 minPositionOut
    ) external returns (uint256);

    function divestAll(address user, uint256[] calldata minPositionsOut)
        external
        returns (uint256);

    function getExchangeAmount(
        uint256 proposalId,
        address from,
        uint256 amount,
        address[] calldata optionalPath
    ) external view returns (uint256 minAmountOut);

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) external;
}
