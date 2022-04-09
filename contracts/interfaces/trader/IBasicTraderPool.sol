// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolInvestorsHook.sol";
import "./ITraderPoolRiskyProposal.sol";
import "./ITraderPool.sol";

/**
 * This is the first type of pool that can de deployed by the trader in the DEXE platform.
 * BasicTraderPool inherits TraderPool functionality and adds the ability to invest into the risky proposals.
 * RiskyProposals are basically subpools where the trader is only allowed to open positions to the prespecified token.
 * Investors can enter subpools by allocating parts of their funds to the proposals. The allocation as done
 * through internal withdrawal and deposit process
 */
interface IBasicTraderPool is ITraderPoolInvestorsHook {
    /// @notice This function is used to create risky proposals (basicaly subpools) and allow investors to invest into it.
    /// The proposals follow pretty much the same rules as the main pool except that the trade can happen with a specified token only.
    /// Investors can't fund the proposal more than the trader percentage wise
    /// @param token the token the proposal will be opened to
    /// @param lpAmount the amount of LP tokens the trader would like to invest into the proposal at its creation
    /// @param proposalLimits the certain limits this proposal will have
    /// @param instantTradePercentage the percentage of LP tokens (base tokens under them) that will be traded to the proposal token
    /// @param minDivestOut is an array of minimal received amounts of positions on proposal creation (call getDivestAmountsAndCommissions()) to fetch this values
    /// @param minProposalOut is a minimal received amount of proposal position on proposal creation (call getCreationTokens()) to fetch this value
    /// @param optionalPath is an optional path between the base token and proposal token that will be used by the pathfinder
    function createProposal(
        address token,
        uint256 lpAmount,
        ITraderPoolRiskyProposal.ProposalLimits calldata proposalLimits,
        uint256 instantTradePercentage,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut,
        address[] calldata optionalPath
    ) external;

    /// @notice This function invests into the created proposals. The function takes user's part of the pool, converts it to
    /// the base token and puts the funds into the proposal
    /// @param proposalId the id of the proposal a user would like to invest to
    /// @param lpAmount the amount of LP tokens to invest into the proposal
    /// @param minDivestOut the minimal received pool positions amounts
    /// @param minProposalOut the minimal amount of proposal tokens to receive
    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut
    ) external;

    /// @notice This function divests from the proposal and puts the funds back to the main pool
    /// @param proposalId the id of the proposal to divest from
    /// @param lp2Amount the amount of proposal LP tokens to be divested
    /// @param minInvestsOut the minimal amounts of main pool positions tokens to be received
    /// @param minProposalOut the minimal amount of base tokens received on a proposal divest
    function reinvestProposal(
        uint256 proposalId,
        uint256 lp2Amount,
        uint256[] calldata minInvestsOut,
        uint256 minProposalOut
    ) external;

    /// @notice This function divests all users' proposals with maximum available LP2 amounts
    /// @param minInvestsOut the minimal amounts of main pool positions tokens to be recieved
    /// @param minProposalsOut the minimal amounts of base tokens received from proposals positions
    function reinvestAllProposals(
        uint256[] calldata minInvestsOut,
        uint256[] calldata minProposalsOut
    ) external;
}
