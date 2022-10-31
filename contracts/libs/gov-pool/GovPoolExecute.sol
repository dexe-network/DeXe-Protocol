// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/settings/IGovSettings.sol";
import "../../interfaces/gov/validators/IGovValidators.sol";

import "../utils/DataHelper.sol";
import "../math/MathHelper.sol";
import "../utils/TokenBalance.sol";

import "../../gov/GovPool.sol";

library GovPoolExecute {
    using DataHelper for bytes;
    using MathHelper for uint256;
    using Math for uint256;
    using TokenBalance for address;

    event ProposalExecuted(uint256 proposalId, address sender);

    function execute(mapping(uint256 => IGovPool.Proposal) storage proposals, uint256 proposalId)
        external
    {
        IGovPool.Proposal storage proposal = proposals[proposalId];
        IGovPool.ProposalCore storage core = proposal.core;

        require(
            IGovPool(address(this)).getProposalState(proposalId) ==
                IGovPool.ProposalState.Succeeded,
            "Gov: invalid status"
        );

        core.executed = true;

        address[] memory executors = proposal.executors;
        uint256[] memory values = proposal.values;
        bytes[] memory data = proposal.data;

        for (uint256 i; i < data.length; i++) {
            (bool status, bytes memory returnedData) = executors[i].call{value: values[i]}(
                data[i]
            );

            require(status, returnedData.getRevertMsg());
        }

        emit ProposalExecuted(proposalId, msg.sender);

        _payCommission(core);
    }

    function moveProposalToValidators(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        (, , address govValidators, ) = IGovPool(address(this)).getHelperContracts();

        require(
            IGovPool(address(this)).getProposalState(proposalId) ==
                IGovPool.ProposalState.WaitingForVotingTransfer,
            "Gov: can't be moved"
        );

        IGovValidators(govValidators).createExternalProposal(
            proposalId,
            core.settings.durationValidators,
            core.settings.quorumValidators
        );
    }

    function _payCommission(IGovPool.ProposalCore storage core) internal {
        IGovSettings.ProposalSettings storage settings = core.settings;
        (, , address govValidators, ) = IGovPool(address(this)).getHelperContracts();

        address rewardToken = settings.rewardToken;

        if (rewardToken == address(0)) {
            return;
        }

        uint256 totalRewards = settings.creationReward *
            IGovValidators(govValidators).validatorsCount() >
            0
            ? 2
            : 1 +
                settings.executionReward +
                core.votesFor.ratio(settings.voteRewardsCoefficient, PRECISION);

        (, uint256 commissionPercentage, , address[3] memory commissionReceivers) = GovPool(
            payable(address(this))
        ).coreProperties().getDEXECommissionPercentages();

        uint256 commission = rewardToken.normThisBalance().min(
            totalRewards.percentage(commissionPercentage)
        );

        rewardToken.sendFunds(commissionReceivers[1], commission);
    }
}
