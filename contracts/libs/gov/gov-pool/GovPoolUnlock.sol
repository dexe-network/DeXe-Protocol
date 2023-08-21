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
        mapping(address => EnumerableSet.UintSet) storage votedInProposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        uint256[] calldata proposalIds,
        address user
    ) external {
        EnumerableSet.UintSet storage userProposals = votedInProposals[user];

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        uint256 maxLockedAmount = userKeeper.maxLockedAmount(user);
        uint256 maxUnlocked;

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            if (_proposalIsActive(proposalId)) {
                continue;
            }

            IGovPool.VotePower storage personalPower = voteInfos[proposalId][user].votePowers[
                IGovPool.VoteType.PersonalVote
            ];

            uint256 lockedInProposal = personalPower.tokensVoted;

            maxUnlocked = maxUnlocked.max(lockedInProposal);

            if (lockedInProposal != 0) {
                userKeeper.unlockTokens(proposalId, user, lockedInProposal);
            }

            if (personalPower.nftsVoted.length() != 0) {
                userKeeper.unlockNfts(personalPower.nftsVoted.values());
            }

            userProposals.remove(proposalId);
        }

        if (maxLockedAmount <= maxUnlocked) {
            userKeeper.updateMaxTokenLockedAmount(userProposals.values(), user);
        }
    }

    function _proposalIsActive(uint256 proposalId) internal view returns (bool) {
        IGovPool.ProposalState state = IGovPool(address(this)).getProposalState(proposalId);

        return
            state != IGovPool.ProposalState.ExecutedFor &&
            state != IGovPool.ProposalState.ExecutedAgainst &&
            state != IGovPool.ProposalState.SucceededFor &&
            state != IGovPool.ProposalState.SucceededAgainst &&
            state != IGovPool.ProposalState.Defeated;
    }
}
