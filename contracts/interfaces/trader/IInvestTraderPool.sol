// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolInvestProposal.sol";
import "./ITraderPool.sol";

/**
 * This is the second type of the pool the trader is able to create in the DEXE platform. Similar to the BasicTraderPool,
 * it inherits the functionality of the TraderPool yet differs in the proposals implementation. Investors can fund the
 * investment proposals and the trader will be able to do whetever he wants to do with the received funds then
 */
interface IInvestTraderPool {
    function createProposal(
        uint256 lpAmount,
        ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits,
        uint256[] calldata minPositionsOut
    ) external;

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minPositionsOut
    ) external;

    function reinvestProposal(uint256 proposalId, uint256[] calldata minPositionsOut) external;

    function reinvestAllProposals(uint256[] calldata minPositionsOut) external;

    function checkRemoveInvestor(address user) external;

    function checkNewInvestor(address user) external;
}
