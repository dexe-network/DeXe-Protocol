// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./GovVote.sol";

abstract contract GovController is GovVote {
    function depositTokens(address receiver, uint256 amount) external override {
        userKeeper.depositTokens(msg.sender, receiver, amount);
    }

    function withdrawTokens(address receiver, uint256 amount) external override {
        unlock(msg.sender);
        userKeeper.withdrawTokens(msg.sender, receiver, amount);
    }

    function delegateTokens(address delegatee, uint256 amount) external override {
        unlock(msg.sender);
        userKeeper.delegateTokens(msg.sender, delegatee, amount);
    }

    function undelegateTokens(address delegatee, uint256 amount) external override {
        // TODO
    }

    function unlock(address user) public override {
        unlockInProposals(_votedInProposals[user].values(), user);
    }

    function unlockInProposals(uint256[] memory proposalIds, address user) public override {
        IGovUserKeeper userKeeper = govUserKeeper;

        for (uint256 i; i < proposalIds.length; i++) {
            _beforeUnlock(proposalIds[i]);

            userKeeper.unlockTokens(user, proposalIds[i]);
            userKeeper.unlockNfts(user, _voteInfos[proposalIds[i]][user].nftsVoted.values());

            _votedInProposals[user].remove(proposalIds[i]);
        }
    }

    function _beforeUnlock(uint256 proposalId) private view {
        ProposalState state = _getProposalState(proposals[proposalId].core);

        require(
            state == ProposalState.Succeeded || state == ProposalState.Defeated,
            "GovV: invalid proposal status"
        );
    }
}
