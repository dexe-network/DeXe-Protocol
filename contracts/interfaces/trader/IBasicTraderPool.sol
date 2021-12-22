// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolRiskyProposal.sol";
import "./ITraderPool.sol";

/**
 * This is the one of the possible pools that can de deployed by the trader in the DEXE platform.
 * BasicTraderPool inherits TraderPool functionality and adds the possiblity to invest into the risky proposals.
 * RiskyProposals are basically subpools where the trader is only allowed to open positions to the prespecified token.
 * Investors can enter subpools by allocating parts of their funds to the proposals
 */
interface IBasicTraderPool {
    /// @notice This function is used to create risky proposals
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

    function checkRemoveInvestor(address user) external;

    function checkNewInvestor(address user) external;
}
