// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/arrays/ArrayHelper.sol";

import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/validators/IGovValidators.sol";

import "../data-structures/ShrinkableArray.sol";

import "../../gov/GovPool.sol";

import "../../core/Globals.sol";

library GovPoolView {
    using EnumerableSet for EnumerableSet.UintSet;
    using ArrayHelper for uint256[];
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using Math for uint256;

    function getWithdrawableAssets(
        address user,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage _votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage _voteInfos
    )
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getUserProposals(user, false, _votedInProposals);

        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, user, false, _voteInfos);

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        return IGovUserKeeper(userKeeper).getWithdrawableAssets(user, lockedIds, unlockedNfts);
    }

    function getUndelegateableAssets(
        address delegator,
        address delegatee,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage _votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage _voteInfos
    )
        external
        view
        returns (uint256 undelegateableTokens, ShrinkableArray.UintArray memory undelegateableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getUserProposals(delegatee, true, _votedInProposals);

        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, delegatee, true, _voteInfos);

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
        ShrinkableArray.UintArray memory unlockedIds,
        address user,
        bool isMicropool,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage _voteInfos
    ) internal view returns (uint256[] memory unlockedNfts) {
        uint256 totalLength;

        for (uint256 i; i < unlockedIds.length; i++) {
            totalLength += _voteInfos[unlockedIds.values[i]][user][isMicropool].nftsVoted.length();
        }

        unlockedNfts = new uint256[](totalLength);
        totalLength = 0;

        for (uint256 i; i < unlockedIds.length; i++) {
            IGovPool.VoteInfo storage voteInfo = _voteInfos[unlockedIds.values[i]][user][
                isMicropool
            ];

            totalLength = unlockedNfts.insert(totalLength, voteInfo.nftsVoted.values());
        }
    }

    function getUserProposals(
        address user,
        bool isMicropool,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage _votedInProposals
    )
        internal
        view
        returns (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        )
    {
        EnumerableSet.UintSet storage votes = _votedInProposals[user][isMicropool];
        uint256 proposalsLength = votes.length();

        uint256[] memory unlockedProposals = new uint256[](proposalsLength);
        uint256[] memory lockedProposals = new uint256[](proposalsLength);
        uint256 unlockedLength;
        uint256 lockedLength;

        for (uint256 i; i < proposalsLength; i++) {
            uint256 proposalId = votes.at(i);

            IGovPool.ProposalState state = IGovPool(address(this)).getProposalState(proposalId);

            if (
                state == IGovPool.ProposalState.Executed ||
                state == IGovPool.ProposalState.Succeeded ||
                state == IGovPool.ProposalState.Defeated
            ) {
                unlockedProposals[unlockedLength++] = proposalId;
            } else {
                lockedProposals[lockedLength++] = proposalId;
            }
        }

        unlockedIds = unlockedProposals.transform().crop(unlockedLength);
        lockedIds = lockedProposals.transform().crop(lockedLength);
    }

    function getProposals(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 offset,
        uint256 limit
    ) internal view returns (IGovPool.ProposalView[] memory proposalViews) {
        GovPool govPool = GovPool(payable(address(this)));
        (, , address validators, ) = govPool.getHelperContracts();

        uint256 to = (offset + limit).min(govPool.latestProposalId()).max(offset);

        proposalViews = new IGovPool.ProposalView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            proposalViews[i - offset] = IGovPool.ProposalView({
                proposal: proposals[i + 1],
                validatorProposal: IGovValidators(validators).getExternalProposal(i + 1),
                proposalState: govPool.getProposalState(i + 1),
                requiredQuorum: govPool.getProposalRequiredQuorum(i + 1),
                requiredValidatorsQuorum: IGovValidators(validators).getProposalRequiredQuorum(
                    i + 1,
                    false
                )
            });
        }
    }
}
