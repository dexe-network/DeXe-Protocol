// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../gov/GovPool.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;

    event Voted(uint256 proposalId, address sender, uint256 personalVote, uint256 delegatedVote);

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        bool useDelegated = !proposals[proposalId].core.settings.delegatedVotingAllowed;

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][false];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][false];

        return
            _vote(core, votes, voteInfo, proposalId, voteAmount, voteNftIds, false, useDelegated);
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");
        require(
            proposals[proposalId].core.settings.delegatedVotingAllowed,
            "Gov: delegated voting off"
        );

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][true];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][true];

        return _vote(core, votes, voteInfo, proposalId, voteAmount, voteNftIds, true, false);
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isMicropool,
        bool useDelegated
    ) internal returns (uint256 reward) {
        _canParticipate(core, proposalId, isMicropool, useDelegated);

        votes.add(proposalId);

        require(
            votes.length() <= GovPool(payable(address(this))).coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        _voteTokens(core, voteInfo, proposalId, voteAmount, isMicropool, useDelegated);
        reward = _voteNfts(core, voteInfo, voteNftIds, isMicropool, useDelegated) + voteAmount;

        emit Voted(proposalId, msg.sender, isMicropool ? 0 : reward, isMicropool ? reward : 0);
    }

    function _canParticipate(
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
            IGovUserKeeper(userKeeper).canParticipate(
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
        bool useDelegated
    ) internal {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper(userKeeper).lockTokens(proposalId, msg.sender, isMicropool, amount);
        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            msg.sender,
            isMicropool,
            useDelegated
        );

        require(
            amount <= tokenBalance - ownedBalance - voteInfo.tokensVoted,
            "Gov: wrong vote amount"
        );

        voteInfo.totalVoted += amount;
        voteInfo.tokensVoted += amount;

        core.votesFor += amount;
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated
    ) internal returns (uint256 voteAmount) {
        for (uint256 i; i < nftIds.length; i++) {
            require(voteInfo.nftsVoted.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper(userKeeper).lockNfts(msg.sender, isMicropool, useDelegated, nftIds);

        IGovUserKeeper(userKeeper).updateNftPowers(nftIds);

        voteAmount = IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
            nftIds,
            core.nftPowerSnapshotId
        );

        voteInfo.totalVoted += voteAmount;

        core.votesFor += voteAmount;
    }
}
