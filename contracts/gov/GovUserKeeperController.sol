// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/gov/IGovUserKeeperController.sol";

import "./GovFee.sol";

abstract contract GovUserKeeperController is IGovUserKeeperController, GovFee {
    using EnumerableSet for EnumerableSet.UintSet;
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;

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

    function getWithdrawableAssets(address user)
        external
        view
        override
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getProposals(user, false);
        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, user, false);

        return govUserKeeper.getWithdrawableAssets(user, lockedIds, unlockedNfts);
    }

    function getUndelegateableAssets(address delegator, address delegatee)
        external
        view
        override
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getProposals(delegatee, true);
        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, delegatee, true);

        return
            govUserKeeper.getUndelegateableAssets(delegator, delegatee, lockedIds, unlockedNfts);
    }

    function getProposals(address user, bool isMicropool)
        public
        view
        returns (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        )
    {
        uint256[] memory unlockedProposals = new uint256[](
            _votedInProposals[user][isMicropool].length()
        );
        uint256[] memory lockedProposals = new uint256[](
            _votedInProposals[user][isMicropool].length()
        );
        uint256 unlockedLength;
        uint256 lockedLength;

        for (uint256 i; i < unlockedProposals.length; i++) {
            uint256 proposalId = _votedInProposals[user][isMicropool].at(i);

            ProposalState state = _getProposalState(proposals[proposalId].core);

            if (state == ProposalState.Succeeded || state == ProposalState.Defeated) {
                unlockedProposals[unlockedLength++] = proposalId;
            } else {
                lockedProposals[lockedLength++] = proposalId;
            }
        }

        unlockedIds = unlockedProposals.transform().crop(unlockedLength);
        lockedIds = lockedProposals.transform().crop(lockedLength);
    }

    function getUnlockedNfts(
        ShrinkableArray.UintArray memory unlockedIds,
        address user,
        bool isMicropool
    ) public view returns (uint256[] memory unlockedNfts) {
        uint256 totalLength;

        for (uint256 i; i < unlockedIds.length; i++) {
            totalLength += _voteInfos[unlockedIds.values[i]][user][isMicropool].nftsVoted.length();
        }

        unlockedNfts = new uint256[](totalLength);
        totalLength = 0;

        for (uint256 i; i < unlockedIds.length; i++) {
            VoteInfo storage voteInfo = _voteInfos[unlockedIds.values[i]][user][isMicropool];

            uint256 length = voteInfo.nftsVoted.length();

            for (uint256 j; j < length; j++) {
                unlockedNfts[totalLength++] = voteInfo.nftsVoted.at(j);
            }
        }
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
            require(
                _votedInProposals[user][isMicropool].contains(proposalIds[i]),
                "GovUKC: hasn't voted for this proposal"
            );

            ProposalState state = _getProposalState(proposals[proposalIds[i]].core);

            if (state != ProposalState.Succeeded && state != ProposalState.Defeated) {
                continue;
            }

            userKeeper.unlockTokens(proposalIds[i], user, isMicropool);
            userKeeper.unlockNfts(
                _voteInfos[proposalIds[i]][user][isMicropool].nftsVoted.values()
            );

            _votedInProposals[user][isMicropool].remove(proposalIds[i]);
        }

        userKeeper.updateMaxTokenLockedAmount(
            _votedInProposals[user][isMicropool].values(),
            user,
            isMicropool
        );
    }
}
