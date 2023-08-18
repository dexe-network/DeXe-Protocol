// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/data-structures/memory/Vector.sol";
import "@solarity/solidity-lib/libs/arrays/SetHelper.sol";

import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/validators/IGovValidators.sol";

import "../../../gov/GovPool.sol";

import "./GovPoolVote.sol";

import "../../../core/Globals.sol";

library GovPoolView {
    using EnumerableSet for EnumerableSet.UintSet;
    using SetHelper for EnumerableSet.AddressSet;
    using GovPoolVote for IGovPool.ProposalCore;
    using Vector for Vector.UintVector;
    using Math for uint256;

    function getWithdrawableAssets(
        address user,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage _votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage _voteInfos
    ) external view returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts) {
        (uint256[] memory unlockedIds, uint256[] memory lockedIds) = _getUserProposals(
            user,
            IGovPool.VoteType.PersonalVote,
            _votedInProposals
        );

        uint256[] memory unlockedNfts = _getUnlockedNfts(
            unlockedIds,
            user,
            IGovPool.VoteType.PersonalVote,
            _voteInfos
        );

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        return IGovUserKeeper(userKeeper).getWithdrawableAssets(user, lockedIds, unlockedNfts);
    }

    function getProposals(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 offset,
        uint256 limit
    ) external view returns (IGovPool.ProposalView[] memory proposalViews) {
        GovPool govPool = GovPool(payable(address(this)));
        (, , address validatorsAddress, ) = govPool.getHelperContracts();

        IGovValidators validators = IGovValidators(validatorsAddress);

        uint256 to = (offset + limit).min(govPool.latestProposalId()).max(offset);

        proposalViews = new IGovPool.ProposalView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            proposalViews[i - offset] = IGovPool.ProposalView({
                proposal: proposals[i + 1],
                validatorProposal: validators.getExternalProposal(i + 1),
                proposalState: govPool.getProposalState(i + 1),
                requiredQuorum: govPool.getProposalRequiredQuorum(i + 1),
                requiredValidatorsQuorum: validators.getProposalRequiredQuorum(i + 1, false)
            });
        }
    }

    function getProposalState(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external view returns (IGovPool.ProposalState) {
        (, , address validators, ) = IGovPool(address(this)).getHelperContracts();

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        uint64 voteEnd = core.voteEnd;

        if (voteEnd == 0) {
            return IGovPool.ProposalState.Undefined;
        }

        if (core.executionTime != 0) {
            return
                _votesForMoreThanAgainst(core)
                    ? IGovPool.ProposalState.ExecutedFor
                    : IGovPool.ProposalState.ExecutedAgainst;
        }

        if (core.settings.earlyCompletion || voteEnd < block.timestamp) {
            if (core._quorumReached()) {
                if (
                    !_votesForMoreThanAgainst(core) &&
                    proposals[proposalId].actionsOnAgainst.length == 0
                ) {
                    return IGovPool.ProposalState.Defeated;
                }

                if (core.settings.validatorsVote) {
                    IGovValidators.ProposalState status = IGovValidators(validators)
                        .getProposalState(proposalId, false);

                    if (status == IGovValidators.ProposalState.Undefined) {
                        if (IGovValidators(validators).validatorsCount() != 0) {
                            return IGovPool.ProposalState.WaitingForVotingTransfer;
                        }

                        return _proposalStateBasedOnVoteResultsAndLock(core);
                    }

                    if (status == IGovValidators.ProposalState.Locked) {
                        return IGovPool.ProposalState.Locked;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return _proposalStateBasedOnVoteResults(core);
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return IGovPool.ProposalState.Defeated;
                    }

                    return IGovPool.ProposalState.ValidatorVoting;
                }

                return _proposalStateBasedOnVoteResultsAndLock(core);
            }

            if (voteEnd < block.timestamp) {
                return IGovPool.ProposalState.Defeated;
            }
        }

        return IGovPool.ProposalState.Voting;
    }

    function _getUnlockedNfts(
        uint256[] memory unlockedIds,
        address user,
        IGovPool.VoteType voteType,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage _voteInfos
    ) internal view returns (uint256[] memory unlockedNfts) {
        Vector.UintVector memory nfts = Vector.newUint();

        for (uint256 i; i < unlockedIds.length; i++) {
            IGovPool.VoteInfo storage voteInfo = _voteInfos[unlockedIds[i]][user][voteType];

            nfts.push(voteInfo.nftsVoted.values());
        }

        unlockedNfts = nfts.toArray();
    }

    function _getUserProposals(
        address user,
        IGovPool.VoteType voteType,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage _votedInProposals
    ) internal view returns (uint256[] memory unlockedIds, uint256[] memory lockedIds) {
        EnumerableSet.UintSet storage votes = _votedInProposals[user][voteType];
        uint256 proposalsLength = votes.length();

        Vector.UintVector memory unlocked = Vector.newUint();
        Vector.UintVector memory locked = Vector.newUint();

        for (uint256 i; i < proposalsLength; i++) {
            uint256 proposalId = votes.at(i);

            IGovPool.ProposalState state = IGovPool(address(this)).getProposalState(proposalId);

            if (
                state == IGovPool.ProposalState.ExecutedFor ||
                state == IGovPool.ProposalState.ExecutedAgainst ||
                state == IGovPool.ProposalState.SucceededFor ||
                state == IGovPool.ProposalState.SucceededAgainst ||
                state == IGovPool.ProposalState.Defeated
            ) {
                unlocked.push(proposalId);
            } else {
                locked.push(proposalId);
            }
        }

        unlockedIds = unlocked.toArray();
        lockedIds = locked.toArray();
    }

    function _addActiveProposalsByType(
        address user,
        IGovPool.VoteType voteType,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage _votedInProposals,
        Vector.UintVector memory activeProposals
    ) internal view {
        EnumerableSet.UintSet storage votes = _votedInProposals[user][voteType];
        uint256 proposalsLength = votes.length();

        for (uint256 i; i < proposalsLength; i++) {
            uint256 proposalId = votes.at(i);

            IGovPool.ProposalState state = IGovPool(address(this)).getProposalState(proposalId);

            if (
                state == IGovPool.ProposalState.ExecutedFor ||
                state == IGovPool.ProposalState.ExecutedAgainst ||
                state == IGovPool.ProposalState.SucceededFor ||
                state == IGovPool.ProposalState.SucceededAgainst ||
                state == IGovPool.ProposalState.Defeated
            ) {
                continue;
            }

            activeProposals.push(proposalId);
        }
    }

    function _votesForMoreThanAgainst(
        IGovPool.ProposalCore storage core
    ) internal view returns (bool) {
        return core.votesFor > core.votesAgainst;
    }

    function _proposalStateBasedOnVoteResultsAndLock(
        IGovPool.ProposalCore storage core
    ) internal view returns (IGovPool.ProposalState) {
        if (block.timestamp <= core.executeAfter) {
            return IGovPool.ProposalState.Locked;
        }

        return _proposalStateBasedOnVoteResults(core);
    }

    function _proposalStateBasedOnVoteResults(
        IGovPool.ProposalCore storage core
    ) internal view returns (IGovPool.ProposalState) {
        return
            _votesForMoreThanAgainst(core)
                ? IGovPool.ProposalState.SucceededFor
                : IGovPool.ProposalState.SucceededAgainst;
    }
}
