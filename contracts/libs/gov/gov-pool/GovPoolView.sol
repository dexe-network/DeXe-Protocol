// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/data-structures/memory/Vector.sol";

import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/validators/IGovValidators.sol";

import "../../../gov/GovPool.sol";

import "../../../core/Globals.sol";

library GovPoolView {
    using EnumerableSet for EnumerableSet.UintSet;
    using Vector for Vector.UintVector;
    using Math for uint256;

    function getWithdrawableAssets(
        address user,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage _votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage _voteInfos
    ) external view returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts) {
        (uint256[] memory unlockedIds, uint256[] memory lockedIds) = getUserProposals(
            user,
            IGovPool.VoteType.PersonalVote,
            _votedInProposals
        );

        uint256[] memory unlockedNfts = getUnlockedNfts(
            unlockedIds,
            user,
            IGovPool.VoteType.PersonalVote,
            _voteInfos
        );

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        return IGovUserKeeper(userKeeper).getWithdrawableAssets(user, lockedIds, unlockedNfts);
    }

    function getUndelegateableAssets(
        address delegator,
        address delegatee,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage _votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage _voteInfos
    ) external view returns (uint256 undelegateableTokens, uint256[] memory undelegateableNfts) {
        (uint256[] memory unlockedIds, uint256[] memory lockedIds) = getUserProposals(
            delegatee,
            IGovPool.VoteType.MicropoolVote,
            _votedInProposals
        );

        uint256[] memory unlockedNfts = getUnlockedNfts(
            unlockedIds,
            delegatee,
            IGovPool.VoteType.MicropoolVote,
            _voteInfos
        );

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        return
            IGovUserKeeper(userKeeper).getUndelegateableAssets(
                delegator,
                delegatee,
                lockedIds,
                unlockedNfts
            );
    }

    function getUnlockedNfts(
        uint256[] memory unlockedIds,
        address user,
        IGovPool.VoteType voteType,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage _voteInfos
    ) internal view returns (uint256[] memory unlockedNfts) {
        Vector.UintVector memory nfts = Vector.newUint();

        for (uint256 i; i < unlockedIds.length; i++) {
            IGovPool.VoteInfo storage voteInfo = _voteInfos[unlockedIds[i]][user][voteType];

            nfts.push(voteInfo.nftsVotedFor.values());
            nfts.push(voteInfo.nftsVotedAgainst.values());
        }

        unlockedNfts = nfts.toArray();
    }

    function getUserProposals(
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

    function getProposals(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 offset,
        uint256 limit
    ) internal view returns (IGovPool.ProposalView[] memory proposalViews) {
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
                requiredValidatorsQuorum: validators.getProposalRequiredQuorum(i + 1, false),
                executeAfter: 0
            });
        }
    }
}
