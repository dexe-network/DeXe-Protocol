// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolInvestorsHook.sol";
import "./ITraderPoolInvestProposal.sol";
import "./ITraderPool.sol";

/**
 * This is the second type of the pool the trader is able to create in the DEXE platform. Similar to the BasicTraderPool,
 * it inherits the functionality of the TraderPool yet differs in the proposals implementation. Investors can fund the
 * investment proposals and the trader will be able to do whetever he wants to do with the received funds
 */
interface IInvestTraderPool is ITraderPoolInvestorsHook {
    /// @notice This function returns a timestamp after which investors can start investing into the pool.
    /// The delay starts after opening the first position. Needed to minimize scam
    /// @return the timestamp after which the investment is allowed
    function getInvestDelayEnd() external view returns (uint256);

    /// @notice This function creates an investment proposal that users will be able to invest in
    /// @param descriptionURL the IPFS URL of the description document
    /// @param lpAmount the amount of LP tokens the trader will invest rightaway
    /// @param proposalLimits the certain limits this proposal will have
    /// @param minPositionsOut the amounts of base tokens received from positions to be invested into the proposal
    function createProposal(
        string calldata descriptionURL,
        uint256 lpAmount,
        ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits,
        uint256[] calldata minPositionsOut
    ) external;

    /// @notice The function to invest into the proposal. Contrary to the RiskyProposal there is no percentage wise investment limit
    /// @param proposalId the id of the proposal to invest in
    /// @param lpAmount to amount of lpTokens to be invested into the proposal
    /// @param minPositionsOut the amounts of base tokens received from positions to be invested into the proposal
    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minPositionsOut
    ) external;

    /// @notice This function invests all the profit from the proposal into this pool
    /// @param proposalId the id of the proposal to take the profit from
    /// @param minPositionsOut the amounts of position tokens received on investment
    function reinvestProposal(uint256 proposalId, uint256[] calldata minPositionsOut) external;

    /// @notice This function invests all the profit from all proposals the msg.sender has into this pool
    /// @param minPositionsOut this amounts of position tokens received on investment
    function reinvestAllProposals(uint256[] calldata minPositionsOut) external;
}
