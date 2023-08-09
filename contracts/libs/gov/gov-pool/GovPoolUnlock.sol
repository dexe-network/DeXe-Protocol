// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

library GovPoolUnlock {
    using Math for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    function unlockInProposals(
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address user,
        IGovPool.VoteType voteType
    ) external {
        require(voteType != IGovPool.VoteType.DelegatedVote, "Gov: invalid vote type");

        EnumerableSet.UintSet storage userProposals = votedInProposals[user][voteType];

        if (voteType == IGovPool.VoteType.TreasuryVote) {
            for (uint256 i; i < proposalIds.length; i++) {
                uint256 proposalId = proposalIds[i];

                if (!_proposalIsActive(userProposals, proposalId)) {
                    userProposals.remove(proposalId);
                }
            }
        } else {
            _unlockInProposals(userProposals, voteInfos, proposalIds, user, voteType);
        }
    }

    function _unlockInProposals(
        EnumerableSet.UintSet storage userProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256[] calldata proposalIds,
        address user,
        IGovPool.VoteType voteType
    ) internal {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        uint256 maxLockedAmount = userKeeper.maxLockedAmount(user, voteType);
        uint256 maxUnlocked;

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (_proposalIsActive(userProposals, proposalId)) {
                continue;
            }

            maxUnlocked = userKeeper.unlockTokens(proposalId, user, voteType).max(maxUnlocked);

            IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][user][voteType];

            userKeeper.unlockNfts(voteInfo.nftsVotedFor.values());
            userKeeper.unlockNfts(voteInfo.nftsVotedAgainst.values());

            userProposals.remove(proposalId);
        }

        if (maxLockedAmount <= maxUnlocked) {
            userKeeper.updateMaxTokenLockedAmount(userProposals.values(), user, voteType);
        }
    }

    function _proposalIsActive(
        EnumerableSet.UintSet storage userProposals,
        uint256 proposalId
    ) internal view returns (bool) {
        require(userProposals.contains(proposalId), "Gov: no vote for this proposal");

        IGovPool.ProposalState state = IGovPool(address(this)).getProposalState(proposalId);

        return
            state != IGovPool.ProposalState.ExecutedFor &&
            state != IGovPool.ProposalState.ExecutedAgainst &&
            state != IGovPool.ProposalState.SucceededFor &&
            state != IGovPool.ProposalState.SucceededAgainst &&
            state != IGovPool.ProposalState.Defeated;
    }
}
