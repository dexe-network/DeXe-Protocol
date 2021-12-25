// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolRiskyProposal.sol";
import "./ITraderPool.sol";

interface IBasicTraderPool {
    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) external;

    function createProposal(
        address token,
        uint256 lpAmount,
        ITraderPoolRiskyProposal.ProposalLimits calldata proposalLimits,
        uint256 instantTradePercentage,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut,
        address[] calldata optionalPath
    ) external;

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut
    ) external;

    function reinvestProposal(
        uint256 proposalId,
        uint256 lp2Amount,
        uint256[] calldata minPositionsOut,
        uint256 minProposalOut
    ) external;

    function reinvestAllProposals(
        uint256[] calldata minInvestsOut,
        uint256[] calldata minProposalsOut
    ) external;
}
