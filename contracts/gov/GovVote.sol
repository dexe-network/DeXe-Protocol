// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/gov/IGovVote.sol";

import "../libs/MathHelper.sol";
import "../libs/ShrinkableArray.sol";

import "./GovCreator.sol";

import "../core/Globals.sol";

abstract contract GovVote is IGovVote, GovCreator {
    using Math for uint256;
    using MathHelper for uint256;
    using ShrinkableArray for ShrinkableArray.UintArray;
    using ShrinkableArray for uint256[];
    using EnumerableSet for EnumerableSet.UintSet;

    /// @dev `Validators` contract address
    IGovValidators public validators;

    uint256 public votesLimit;

    mapping(uint256 => uint256) private _totalVotedInProposal; // proposalId => total voted
    mapping(uint256 => mapping(address => VoteInfo)) private _voteInfos; // proposalId => voter => info

    mapping(address => EnumerableSet.UintSet) private _votedInProposals; // voter => active proposal ids

    function __GovVote_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address validatorsAddress,
        uint256 _votesLimit
    ) internal {
        __GovCreator_init(govSettingAddress, govUserKeeperAddress);

        require(_votesLimit > 0);

        validators = IGovValidators(validatorsAddress);
        votesLimit = _votesLimit;
    }

    function voteTokens(uint256 proposalId, uint256 amount) external override {
        _voteTokens(proposalId, amount, msg.sender);
    }

    function voteDelegatedTokens(
        uint256 proposalId,
        uint256 amount,
        address holder
    ) external override {
        _voteTokens(
            proposalId,
            amount.min(govUserKeeper.delegatedTokens(holder, msg.sender)),
            holder
        );
    }

    function voteNfts(uint256 proposalId, uint256[] calldata nftIds) external override {
        _voteNfts(proposalId, nftIds, msg.sender);
    }

    function voteDelegatedNfts(
        uint256 proposalId,
        uint256[] calldata nftIds,
        address holder
    ) external override {
        require(nftIdsFiltered.length > 0, "GovV: nfts is not found");

        _voteNfts(proposalId, nftIds, holder);
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

    function getTotalVotes(uint256 proposalId, address voter)
        external
        view
        override
        returns (uint256, uint256)
    {
        return (_totalVotedInProposal[proposalId], _voteInfos[proposalId][voter].totalVoted);
    }

    function getVoteInfo(uint256 proposalId, address voter)
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256[] memory
        )
    {
        return (
            _totalVotedInProposal[proposalId],
            _voteInfos[proposalId][voter].totalVoted,
            _voteInfos[proposalId][voter].tokensVoted,
            _voteInfos[proposalId][voter].nftsVoted.values()
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

    function _voteTokens(
        uint256 proposalId,
        uint256 amount,
        address voter
    ) private {
        ProposalCore storage core = _beforeVote(proposalId, voter);
        IGovUserKeeper userKeeper = govUserKeeper;

        uint256 tokenBalance = userKeeper.tokenBalance(voter);

        uint256 voted = _voteInfos[proposalId][voter].tokensVoted;
        uint256 voteAmount = amount.min(tokenBalance - voted);

        require(voteAmount > 0, "GovV: vote amount is zero");

        userKeeper.lockTokens(voter, voteAmount, proposalId);

        _totalVotedInProposal[proposalId] += voteAmount;
        _voteInfos[proposalId][voter].totalVoted += voteAmount;
        _voteInfos[proposalId][voter].tokensVoted = voted + voteAmount;

        core.votesFor += voteAmount;
    }

    function _voteNfts(
        uint256 proposalId,
        uint256[] calldata nftIds,
        address voter
    ) private {
        ProposalCore storage core = _beforeVote(proposalId, voter);

        for (uint256 i; i < nftIds.length; i++) {
            require(
                !_voteInfos[proposalId][voter].nftsVoted.contains(nftIds[i]),
                "GovV: NFT already voted"
            );
            require(i == 0 || nftIds[i] > nftIds[i - 1], "GovV: wrong NFT order");
        }

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockNfts(voter, nftIds);
        uint256 voteAmount = userKeeper.getNftsPowerInTokens(nftIds, core.nftPowerSnapshotId);

        require(voteAmount > 0, "GovV: vote amount is zero");

        for (uint256 i; i < nftIds.length; i++) {
            _voteInfos[proposalId][voter].nftsVoted.add(nftIds[i]);
        }

        _totalVotedInProposal[proposalId] += voteAmount;
        _voteInfos[proposalId][voter].totalVoted += voteAmount;

        core.votesFor += voteAmount;
    }

    function _beforeVote(uint256 proposalId, address voter)
        private
        returns (ProposalCore storage)
    {
        _votedInProposals[voter].add(proposalId);
        ProposalCore storage core = proposals[proposalId].core;

        require(_votedInProposals[voter].length() <= votesLimit, "GovV: vote limit reached");
        require(_getProposalState(core) == ProposalState.Voting, "GovV: vote unavailable");
        require(
            govUserKeeper.canUserParticipate(
                voter,
                core.settings.minTokenBalance,
                core.settings.minNftBalance
            ),
            "GovV: low balance"
        );

        return core;
    }
}
