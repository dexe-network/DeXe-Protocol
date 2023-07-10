// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../gov/GovPool.sol";

import "../utils/ArrayCropper.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using ArrayCropper for uint256[];

    event Voted(
        uint256 proposalId,
        address sender,
        uint256 personalVote,
        uint256 delegatedVote,
        bool isVoteFor
    );

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor,
        bool reallocate
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        bool useDelegated = !core.settings.delegatedVotingAllowed;

        return
            _vote(
                core,
                votedInProposals[msg.sender][false],
                voteInfos[proposalId][msg.sender][false],
                proposalId,
                voteAmount,
                voteNftIds,
                false,
                useDelegated,
                isVoteFor,
                reallocate
            );
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor,
        bool reallocate
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        return
            _vote(
                core,
                votedInProposals[msg.sender][true],
                voteInfos[proposalId][msg.sender][true],
                proposalId,
                voteAmount,
                voteNftIds,
                true,
                false,
                isVoteFor,
                reallocate
            );
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor,
        bool reallocate
    ) internal returns (uint256 reward) {
        _canVote(core, proposalId, isMicropool, useDelegated);

        votes.add(proposalId);

        GovPool govPool = GovPool(payable(address(this)));

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        govPool.setLatestVoteBlock(proposalId);

        _voteTokens(
            core,
            voteInfo,
            proposalId,
            voteAmount,
            isMicropool,
            useDelegated,
            isVoteFor,
            reallocate
        );
        reward =
            _voteNfts(
                core,
                voteInfo,
                voteNftIds,
                isMicropool,
                useDelegated,
                isVoteFor,
                reallocate
            ) +
            voteAmount;

        // TODO: so the user can not reallocate his small vote
        require(reward >= core.settings.minVotesForVoting, "Gov: low current vote power");

        emit Voted(
            proposalId,
            msg.sender,
            isMicropool ? 0 : reward,
            isMicropool ? reward : 0,
            isVoteFor
        );
    }

    function _canVote(
        IGovPool.ProposalCore storage core,
        uint256 proposalId,
        bool isMicropool,
        bool useDelegated
    ) internal view {
        IGovPool govPool = IGovPool(address(this));
        (, address userKeeper, , ) = govPool.getHelperContracts();

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            IGovUserKeeper(userKeeper).canVote(
                msg.sender,
                isMicropool,
                useDelegated,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );
    }

    function _voteTokens(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 amount,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor,
        bool reallocate
    ) internal {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        uint256 amountToReallocate;

        if (reallocate) {
            uint256 tokensAbleToReallocate = isVoteFor
                ? voteInfo.tokensVotedAgainst
                : voteInfo.tokensVotedFor;

            amountToReallocate = tokensAbleToReallocate > amount ? amount : tokensAbleToReallocate;
        }

        uint256 amountToLock = amount - amountToReallocate;

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amountToLock);
        (uint256 tokenBalance, uint256 ownedBalance) = userKeeper.tokenBalance(
            msg.sender,
            isMicropool,
            useDelegated
        );

        require(
            amountToLock <=
                tokenBalance -
                    ownedBalance -
                    voteInfo.tokensVotedFor -
                    voteInfo.tokensVotedAgainst,
            "Gov: wrong vote amount"
        );

        if (isVoteFor) {
            core.votesFor += amount;
            voteInfo.totalVotedFor += amount;
            voteInfo.tokensVotedFor += amount;

            voteInfo.totalVotedAgainst -= amountToReallocate;
            voteInfo.tokensVotedAgainst -= amountToReallocate;
        } else {
            core.votesAgainst += amount;
            voteInfo.totalVotedAgainst += amount;
            voteInfo.tokensVotedAgainst += amount;

            voteInfo.totalVotedFor -= amountToReallocate;
            voteInfo.tokensVotedFor -= amountToReallocate;
        }
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor,
        bool reallocate
    ) internal returns (uint256 voteAmount) {
        uint256[] memory nftIdsToLock = new uint256[](nftIds.length);
        uint256[] memory nftIdsToReallocate = new uint256[](nftIds.length);

        {
            uint256 nftIdsToLockAmount;
            uint256 nftIdsToReallocateAmount;

            (
                EnumerableSet.UintSet storage votedNfts,
                EnumerableSet.UintSet storage votedOpposedNfts
            ) = _votedNfts(voteInfo, isVoteFor);

            for (uint256 i; i < nftIds.length; i++) {
                require(votedNfts.add(nftIds[i]), "Gov: NFT already voted");

                if (reallocate) {
                    votedOpposedNfts.remove(nftIds[i]);

                    nftIdsToReallocate[nftIdsToReallocateAmount++] = nftIds[i];
                } else {
                    require(!votedOpposedNfts.contains(nftIds[i]), "Gov: NFT already voted");

                    nftIdsToLock[nftIdsToLockAmount++] = nftIds[i];
                }
            }

            nftIdsToLock = nftIdsToLock.crop(nftIdsToLockAmount);
            nftIdsToReallocate = nftIdsToReallocate.crop(nftIdsToReallocateAmount);
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIdsToLock);

        userKeeper.updateNftPowers(nftIdsToLock);

        if (reallocate || nftIdsToReallocate.length > 0) {
            voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(
                nftIdsToReallocate,
                core.nftPowerSnapshotId
            );

            if (isVoteFor) {
                core.votesAgainst -= voteAmount;
                voteInfo.totalVotedAgainst -= voteAmount;
            } else {
                core.votesFor -= voteAmount;
                voteInfo.totalVotedFor -= voteAmount;
            }
        }

        voteAmount += userKeeper.getNftsPowerInTokensBySnapshot(
            nftIdsToLock,
            core.nftPowerSnapshotId
        );

        if (isVoteFor) {
            core.votesFor += voteAmount;
            voteInfo.totalVotedFor += voteAmount;
        } else {
            core.votesAgainst += voteAmount;
            voteInfo.totalVotedAgainst += voteAmount;
        }
    }

    function _votedNfts(
        IGovPool.VoteInfo storage voteInfo,
        bool isVoteFor
    ) internal view returns (EnumerableSet.UintSet storage, EnumerableSet.UintSet storage) {
        return
            isVoteFor
                ? (voteInfo.nftsVotedFor, voteInfo.nftsVotedAgainst)
                : (voteInfo.nftsVotedAgainst, voteInfo.nftsVotedFor);
    }
}
