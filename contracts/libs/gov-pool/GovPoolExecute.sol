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

    event ProposalExecuted(uint256 proposalId, address sender);

    function execute(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.Proposal storage proposal = proposals[proposalId];
        IGovPool.ProposalCore storage core = proposal.core;

        GovPool govPool = GovPool(payable(address(this)));

        IGovPool.ProposalState propsalState = govPool.getProposalState(proposalId);

        require(
            propsalState == IGovPool.ProposalState.SucceededFor ||
                propsalState == IGovPool.ProposalState.SucceededAgainst,
            "Gov: invalid status"
        );
        require(govPool.latestVoteBlocks(proposalId) < block.number, "Gov: wrong block");

        core.executed = true;

        (, , address govValidatorsAddress, ) = GovPool(payable(address(this)))
            .getHelperContracts();
        IGovValidators govValidators = IGovValidators(govValidatorsAddress);

        bool validatorsVotingSucceeded = IGovValidators(govValidators).getProposalState(
            proposalId,
            false
        ) == IGovValidators.ProposalState.Succeeded;

        if (validatorsVotingSucceeded) {
            govValidators.executeExternalProposal(proposalId);
        }

        IGovPool.ProposalAction[] storage actions = _proposalActionsResult(proposal);

        for (uint256 i; i < actions.length; i++) {
            (bool status, bytes memory returnedData) = actions[i].executor.call{
                value: actions[i].value
            }(actions[i].data);

            require(status, returnedData.getRevertMsg());
        }

        emit ProposalExecuted(proposalId, msg.sender);

        _payCommission(core, validatorsVotingSucceeded, propsalState);
    }

    function _payCommission(
        IGovPool.ProposalCore storage core,
        bool validatorsVotingSucceeded,
        IGovPool.ProposalState propsalState
    ) internal {
        IGovSettings.ProposalSettings storage settings = core.settings;

        uint256 creationRewards = settings.rewardsInfo.creationReward *
            (validatorsVotingSucceeded ? 2 : 1);

        uint256 totalRewards = creationRewards +
            settings.executionReward +
            core.votesFor.ratio(settings.voteRewardsCoefficient, PRECISION);

        return
            core.votesFor > core.votesAgainst ? proposal.actionsOnFor : proposal.actionsOnAgainst;
    }
}
