// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../gov/GovPool.sol";

import "../../libs/math/MathHelper.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using MathHelper for uint256;

    event Voted(
        uint256 proposalId,
        address sender,
        uint256 personalVote,
        uint256 delegatedVote,
        bool isVoteFor
    );

    event VotesCancelled(
        uint256 proposalId,
        address sender,
        uint256 personalCanceledReward,
        uint256 delegatedCanceledReward,
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
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][false];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][false];

        bool useDelegated = !core.settings.delegatedVotingAllowed;

        return
            _vote(
                core,
                votes,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                false,
                useDelegated,
                isVoteFor
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
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][true];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][true];

        return
            _vote(
                core,
                votes,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                true,
                false,
                isVoteFor
            );
    }

    function cancelVotes(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        bool isMicropool,
        uint256 voteAmount,
        uint256[] calldata nftIds,
        bool isVoteFor
    ) external returns (uint256 reallocatedReward) {
        IGovPool govPool = IGovPool(address(this));

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][isMicropool];

        (IGovPool.VoteOption storage voteOption, ) = _voteOptions(voteInfo, isVoteFor);

        require(voteOption.tokensVoted >= voteAmount, "Gov: not enough tokens");

        _saveTokenResult(core, voteInfo, voteAmount, isVoteFor, false);

        for (uint256 i; i < nftIds.length; i++) {
            require(voteOption.nftsVoted.remove(nftIds[i]), "Gov: NFT was not voted");
        }

        (, address userKeeper, , ) = govPool.getHelperContracts();

        uint256 nftVoteAmount = IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
            nftIds,
            core.nftPowerSnapshotId
        );

        _saveNftResult(core, voteInfo, nftVoteAmount, isVoteFor, false);

        reallocatedReward = voteAmount + nftVoteAmount;

        emit VotesCancelled(
            proposalId,
            msg.sender,
            isMicropool ? 0 : reallocatedReward,
            isMicropool ? reallocatedReward : 0,
            isVoteFor
        );
    }

    function _quorumReached(IGovPool.ProposalCore storage core) internal view returns (bool) {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        return
            PERCENTAGE_100.ratio(
                core.votesFor + core.votesAgainst,
                IGovUserKeeper(userKeeperAddress).getTotalVoteWeight()
            ) >= core.settings.quorum;
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

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor
    ) internal returns (uint256 reward) {
        _canVote(core, proposalId, isMicropool, useDelegated);

        votes.add(proposalId);

        GovPool govPool = GovPool(payable(address(this)));

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        _voteTokens(core, voteInfo, proposalId, voteAmount, isMicropool, useDelegated, isVoteFor);
        reward =
            _voteNfts(core, voteInfo, voteNftIds, isMicropool, useDelegated, isVoteFor) +
            voteAmount;

        require(reward >= core.settings.minVotesForVoting, "Gov: low current vote power");

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

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
        bool isVoteFor
    ) internal {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amount);
        (uint256 tokenBalance, uint256 ownedBalance) = userKeeper.tokenBalance(
            msg.sender,
            isMicropool,
            useDelegated
        );

        require(
            amount <=
                tokenBalance -
                    ownedBalance -
                    voteInfo.voteFor.tokensVoted -
                    voteInfo.voteAgainst.tokensVoted,
            "Gov: wrong vote amount"
        );

        _saveTokenResult(core, voteInfo, amount, isVoteFor, true);
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor
    ) internal returns (uint256 voteAmount) {
        (
            IGovPool.VoteOption storage voteOption,
            IGovPool.VoteOption storage voteOptionAggainst
        ) = _voteOptions(voteInfo, isVoteFor);

        for (uint256 i; i < nftIds.length; i++) {
            require(
                voteOption.nftsVoted.add(nftIds[i]) &&
                    !voteOptionAggainst.nftsVoted.contains(nftIds[i]),
                "Gov: NFT already voted"
            );
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIds);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);

        _saveNftResult(core, voteInfo, voteAmount, isVoteFor, true);
    }

    function _saveTokenResult(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256 amount,
        bool isVoteFor,
        bool isPlus
    ) internal {
        (IGovPool.VoteOption storage voteOption, ) = _voteOptions(voteInfo, isVoteFor);

        _addVoteAmountToCore(core, amount, isVoteFor, isPlus);

        voteOption.totalVoted = isPlus
            ? voteOption.totalVoted + amount
            : voteOption.totalVoted - amount;
        voteOption.tokensVoted = isPlus
            ? voteOption.tokensVoted + amount
            : voteOption.tokensVoted - amount;
    }

    function _saveNftResult(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256 amount,
        bool isVoteFor,
        bool isPlus
    ) internal {
        (IGovPool.VoteOption storage voteOption, ) = _voteOptions(voteInfo, isVoteFor);

        _addVoteAmountToCore(core, amount, isVoteFor, isPlus);

        voteOption.totalVoted = isPlus
            ? voteOption.totalVoted + amount
            : voteOption.totalVoted - amount;
    }

    function _addVoteAmountToCore(
        IGovPool.ProposalCore storage core,
        uint256 amount,
        bool isVoteFor,
        bool isPlus
    ) internal {
        if (isVoteFor) {
            core.votesFor = isPlus ? core.votesFor + amount : core.votesFor - amount;
        } else {
            core.votesAgainst = isPlus ? core.votesAgainst + amount : core.votesAgainst - amount;
        }
    }

    function _voteOptions(
        IGovPool.VoteInfo storage voteInfo,
        bool isVoteFor
    ) internal view returns (IGovPool.VoteOption storage, IGovPool.VoteOption storage) {
        return
            isVoteFor
                ? (voteInfo.voteFor, voteInfo.voteAgainst)
                : (voteInfo.voteAgainst, voteInfo.voteFor);
    }
}
