// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/gov/IGovUserKeeperController.sol";

import "./GovFee.sol";

abstract contract GovUserKeeperController is IGovUserKeeperController, GovFee {
    using EnumerableSet for EnumerableSet.UintSet;

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty deposit");

        govUserKeeper.depositTokens(msg.sender, receiver, amount);
        govUserKeeper.depositNfts(msg.sender, receiver, nftIds);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty withdrawal");

        unlock(msg.sender, false);

        govUserKeeper.withdrawTokens(msg.sender, receiver, amount);
        govUserKeeper.withdrawNfts(msg.sender, receiver, nftIds);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty delegation");

        unlock(msg.sender, false);

        govUserKeeper.delegateTokens(msg.sender, delegatee, amount);
        govUserKeeper.delegateNfts(msg.sender, delegatee, nftIds);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty undelegation");

        unlock(delegatee, true);

        govUserKeeper.undelegateTokens(msg.sender, delegatee, amount);
        govUserKeeper.undelegateNfts(msg.sender, delegatee, nftIds);
    }

    function unlock(address user, bool isMicropool) public override {
        unlockInProposals(_votedInProposals[user][isMicropool].values(), user, isMicropool);
    }

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) public override {
        IGovUserKeeper userKeeper = govUserKeeper;

        for (uint256 i; i < proposalIds.length; i++) {
            _beforeUnlock(proposalIds[i], user, isMicropool);

            userKeeper.unlockTokens(proposalIds[i], user, isMicropool);
            userKeeper.unlockNfts(
                _voteInfos[proposalIds[i]][user][isMicropool].nftsVoted.values()
            );

            _votedInProposals[user][isMicropool].remove(proposalIds[i]);
        }

        userKeeper.updateMaxTokenLockedAmount(user, isMicropool);
    }

    function _beforeUnlock(
        uint256 proposalId,
        address user,
        bool isMicropool
    ) private view {
        require(
            _votedInProposals[user][isMicropool].contains(proposalId),
            "GovUKC: hasn't voted for this proposal"
        );

        ProposalState state = _getProposalState(proposals[proposalId].core);

        require(
            state == ProposalState.Succeeded || state == ProposalState.Defeated,
            "GovUKC: invalid proposal status"
        );
    }
}
