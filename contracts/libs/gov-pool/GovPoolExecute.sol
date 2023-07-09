// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/settings/IGovSettings.sol";
import "../../interfaces/gov/validators/IGovValidators.sol";

import "../utils/DataHelper.sol";
import "../math/MathHelper.sol";
import "../utils/TokenBalance.sol";
import "./GovPoolCommission.sol";

import "../../gov/GovPool.sol";

library GovPoolExecute {
    using DataHelper for bytes;
    using MathHelper for uint256;
    using Math for uint256;
    using TokenBalance for address;
    using GovPoolCommission for address;

    /// @notice Emitted when proposal is executed
    /// @param proposalId ID of the proposal
    /// @param isFor True if proposal is executed for, false if against
    /// @param sender Address of the sender
    event ProposalExecuted(uint256 proposalId, bool isFor, address sender);

    function execute(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.Proposal storage proposal = proposals[proposalId];
        IGovPool.ProposalCore storage core = proposal.core;

        GovPool govPool = GovPool(payable(address(this)));

        IGovPool.ProposalState proposalState = govPool.getProposalState(proposalId);

        require(
            proposalState == IGovPool.ProposalState.SucceededFor ||
                proposalState == IGovPool.ProposalState.SucceededAgainst,
            "Gov: invalid status"
        );

        core.executed = true;

        (, , address govValidatorsAddress, ) = govPool.getHelperContracts();
        IGovValidators govValidators = IGovValidators(govValidatorsAddress);

        bool validatorsVotingSucceeded = govValidators.getProposalState(proposalId, false) ==
            IGovValidators.ProposalState.Succeeded;

        if (validatorsVotingSucceeded) {
            govValidators.executeExternalProposal(proposalId);
        }

        IGovPool.ProposalAction[] storage actions = _proposalActionsResult(proposal);

        uint256 actionsLength = actions.length;

        for (uint256 i; i < actionsLength; i++) {
            (bool status, bytes memory returnedData) = actions[i].executor.call{
                value: actions[i].value
            }(actions[i].data);

            require(status, returnedData.getRevertMsg());
        }

        emit ProposalExecuted(
            proposalId,
            proposalState == IGovPool.ProposalState.SucceededFor,
            msg.sender
        );

        _payCommission(core, validatorsVotingSucceeded, proposalState);
    }

    function _payCommission(
        IGovPool.ProposalCore storage core,
        bool validatorsVotingSucceeded,
        IGovPool.ProposalState proposalState
    ) internal {
        IGovSettings.RewardsInfo storage rewardsInfo = core.settings.rewardsInfo;

        uint256 creationRewards = rewardsInfo.creationReward * (validatorsVotingSucceeded ? 2 : 1);

        uint256 voteRewards = proposalState == IGovPool.ProposalState.SucceededFor
            ? core.votesFor.ratio(rewardsInfo.voteForRewardsCoefficient, PRECISION)
            : core.votesAgainst.ratio(rewardsInfo.voteAgainstRewardsCoefficient, PRECISION);

        rewardsInfo.rewardToken.payCommission(
            creationRewards + rewardsInfo.executionReward + voteRewards
        );
    }

    function _proposalActionsResult(
        IGovPool.Proposal storage proposal
    ) internal view returns (IGovPool.ProposalAction[] storage) {
        IGovPool.ProposalCore storage core = proposal.core;

        return
            core.votesFor > core.votesAgainst ? proposal.actionsOnFor : proposal.actionsOnAgainst;
    }
}
