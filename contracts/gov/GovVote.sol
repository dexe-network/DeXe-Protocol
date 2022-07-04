// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/gov/IGovVote.sol";
import "../interfaces/gov/validators/IGovValidators.sol";

import "../libs/MathHelper.sol";

import "./GovCreator.sol";

import "../core/Globals.sol";

abstract contract GovVote is IGovVote, GovCreator {
    using Math for uint256;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    /// @dev `Validators` contract address
    IGovValidators public validators;

    uint256 public votesLimit;

    mapping(uint256 => uint256) private _totalVotedInProposal; // proposalId => total voted
    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info

    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    function __GovVote_init(address validatorsAddress, uint256 _votesLimit) internal {
        require(_votesLimit > 0);

        validators = IGovValidators(validatorsAddress);
        votesLimit = _votesLimit;
    }

    function vote(
        uint256 proposalId,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovV: empty vote");

        _voteTokens(proposalId, amount, false);
        _voteNfts(proposalId, nftIds, false);
    }

    function voteDelegated(
        uint256 proposalId,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovV: empty delegated vote");

        _voteTokens(proposalId, amount, true);
        _voteNfts(proposalId, nftIds, true);
    }

    function _voteTokens(
        uint256 proposalId,
        uint256 amount,
        bool isMicropool
    ) private {
        ProposalCore storage core = _beforeVote(proposalId, isMicropool);
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amount);
        uint256 tokenBalance = userKeeper.tokenBalance(msg.sender, isMicropool);

        require(amount <= tokenBalance - voteInfo.tokensVoted, "GovV: wrong vote amount");

        voteInfo.totalVoted += amount;
        voteInfo.tokensVoted += amount;

        _totalVotedInProposal[proposalId] += amount;

        core.votesFor += amount;
    }

    function _voteNfts(
        uint256 proposalId,
        uint256[] calldata nftIds,
        bool isMicropool
    ) private {
        ProposalCore storage core = _beforeVote(proposalId, isMicropool);
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        for (uint256 i; i < nftIds.length; i++) {
            require(i == 0 || nftIds[i] > nftIds[i - 1], "GovV: wrong NFT order");
            require(!voteInfo.nftsVoted.contains(nftIds[i]), "GovV: NFT already voted");
        }

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockNfts(msg.sender, isMicropool, nftIds);
        uint256 voteAmount = userKeeper.getNftsPowerInTokens(nftIds, core.nftPowerSnapshotId);

        for (uint256 i; i < nftIds.length; i++) {
            voteInfo.nftsVoted.add(nftIds[i]);
        }

        voteInfo.totalVoted += voteAmount;

        _totalVotedInProposal[proposalId] += voteAmount;

        core.votesFor += voteAmount;
    }

    function _beforeVote(uint256 proposalId, bool isMicropool)
        private
        returns (ProposalCore storage)
    {
        ProposalCore storage core = proposals[proposalId].core;

        _votedInProposals[msg.sender][isMicropool].add(proposalId);

        require(
            _votedInProposals[msg.sender][isMicropool].length() <= votesLimit,
            "GovV: vote limit reached"
        );
        require(_getProposalState(core) == ProposalState.Voting, "GovV: vote unavailable");
        require(
            govUserKeeper.canParticipate(
                msg.sender,
                isMicropool,
                core.settings.minTokenBalance,
                core.settings.minNftBalance
            ),
            "GovV: low balance"
        );

        return core;
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        ProposalCore storage core = proposals[proposalId].core;
        ProposalState state = _getProposalState(core);

        require(state == ProposalState.WaitingForVotingTransfer, "GovV: can't be moved");

        validators.createExternalProposal(
            proposalId,
            core.settings.durationValidators,
            core.settings.quorumValidators
        );
    }

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (uint256, uint256) {
        return (
            _totalVotedInProposal[proposalId],
            _voteInfos[proposalId][voter][isMicropool].totalVoted
        );
    }

    function getProposalState(uint256 proposalId) external view override returns (ProposalState) {
        return _getProposalState(proposals[proposalId].core);
    }

    function _getProposalState(ProposalCore storage core) internal view returns (ProposalState) {
        uint64 voteEnd = core.voteEnd;

        if (voteEnd == 0) {
            return ProposalState.Undefined;
        }

        if (core.executed) {
            return ProposalState.Executed;
        }

        if (core.settings.earlyCompletion || voteEnd < block.timestamp) {
            if (_quorumReached(core)) {
                if (address(validators) != address(0)) {
                    IGovValidators.ProposalState status = validators.getProposalState(
                        core.proposalId,
                        false
                    );

                    if (status == IGovValidators.ProposalState.Undefined) {
                        return ProposalState.WaitingForVotingTransfer;
                    }

                    if (status == IGovValidators.ProposalState.Voting) {
                        return ProposalState.ValidatorVoting;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return ProposalState.Succeeded;
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return ProposalState.Defeated;
                    }
                } else {
                    return ProposalState.Succeeded;
                }
            }

            if (voteEnd < block.timestamp) {
                return ProposalState.Defeated;
            }
        }

        return ProposalState.Voting;
    }

    function _quorumReached(ProposalCore storage core) private view returns (bool) {
        uint256 totalVoteWeight = govUserKeeper.getTotalVoteWeight();

        return
            totalVoteWeight == 0
                ? false
                : PERCENTAGE_100.ratio(core.votesFor, totalVoteWeight) >= core.settings.quorum;
    }
}
