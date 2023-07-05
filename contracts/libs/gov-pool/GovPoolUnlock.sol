// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolUnlock {
    using Math for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    function unlockInProposals(
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address user,
        bool isMicropool
    ) external {
        IGovPool govPool = IGovPool(address(this));
        (, address userKeeper, , ) = govPool.getHelperContracts();

        EnumerableSet.UintSet storage userProposals = votedInProposals[user][isMicropool];

        uint256 maxLockedAmount = IGovUserKeeper(userKeeper).maxLockedAmount(user, isMicropool);
        uint256 maxUnlocked;

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            require(userProposals.contains(proposalId), "Gov: no vote for this proposal");

            IGovPool.ProposalState state = govPool.getProposalState(proposalId);

            if (
                state != IGovPool.ProposalState.ExecutedFor &&
                state != IGovPool.ProposalState.ExecutedAgainst &&
                state != IGovPool.ProposalState.SucceededFor &&
                state != IGovPool.ProposalState.SucceededAgainst &&
                state != IGovPool.ProposalState.Defeated
            ) {
                continue;
            }

            maxUnlocked = IGovUserKeeper(userKeeper)
                .unlockTokens(proposalId, user, isMicropool)
                .max(maxUnlocked);
            IGovUserKeeper(userKeeper).unlockNfts(
                voteInfos[proposalId][user][isMicropool].nftsVotedFor.values()
            );
            IGovUserKeeper(userKeeper).unlockNfts(
                voteInfos[proposalId][user][isMicropool].nftsVotedAgainst.values()
            );

            userProposals.remove(proposalId);
        }

        if (maxLockedAmount <= maxUnlocked) {
            IGovUserKeeper(userKeeper).updateMaxTokenLockedAmount(
                userProposals.values(),
                user,
                isMicropool
            );
        }
    }
}
