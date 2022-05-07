// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/gov/validators/IValidators.sol";
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
    IValidators public validators;

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

        validators = IValidators(validatorsAddress);
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
        _voteNfts(proposalId, nftIds.transform(), msg.sender);
    }

    function voteDelegatedNfts(
        uint256 proposalId,
        uint256[] calldata nftIds,
        address holder
    ) external override {
        ShrinkableArray.UintArray memory nftIdsFiltered = govUserKeeper
            .filterNftsAvailableForDelegator(msg.sender, holder, nftIds.transform());

        require(nftIdsFiltered.length > 0, "GovV: nfts is not found");

        _voteNfts(proposalId, nftIdsFiltered, holder);
    }

    function unlock(address user) external override {
        unlockInProposals(_votedInProposals[user].values(), user);
    }

    function unlockInProposals(uint256[] memory proposalIds, address user) public override {
        IGovUserKeeper _govUserKeeper = govUserKeeper;

        for (uint256 i; i < proposalIds.length; i++) {
            _beforeUnlock(proposalIds[i]);

            _govUserKeeper.unlockTokens(user, proposalIds[i]);
            _govUserKeeper.unlockNfts(user, _voteInfos[proposalIds[i]][user].nftsVoted.values());

            _votedInProposals[user].remove(proposalIds[i]);
        }
    }

    function unlockNfts(
        uint256 proposalId,
        address user,
        uint256[] calldata nftIds
    ) external override {
        _beforeUnlock(proposalId);

        for (uint256 i; i < nftIds.length; i++) {
            require(
                _voteInfos[proposalId][user].nftsVoted.contains(nftIds[i]),
                "GovV: NFT is not voting"
            );
        }

        govUserKeeper.unlockNfts(user, nftIds);
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

    function getVoteAmounts(uint256 proposalId, address voter)
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
                    IValidators.ProposalState status = validators.getProposalState(
                        core.proposalId,
                        false
                    );

                    if (status == IValidators.ProposalState.Undefined) {
                        return ProposalState.WaitingForVotingTransfer;
                    }

                    if (status == IValidators.ProposalState.Voting) {
                        return ProposalState.ValidatorVoting;
                    }

                    if (status == IValidators.ProposalState.Succeeded) {
                        return ProposalState.Succeeded;
                    }

                    if (status == IValidators.ProposalState.Defeated) {
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

        uint256 tokenBalance = govUserKeeper.tokenBalance(voter);

        uint256 voted = _voteInfos[proposalId][voter].tokensVoted;
        uint256 voteAmount = amount.min(tokenBalance - voted);

        require(voteAmount > 0, "GovV: vote amount is zero");

        govUserKeeper.lockTokens(voter, voteAmount, proposalId);

        _totalVotedInProposal[proposalId] += voteAmount;
        _voteInfos[proposalId][voter].totalVoted += voteAmount;
        _voteInfos[proposalId][voter].tokensVoted = voted + voteAmount;

        core.votesFor += voteAmount;
    }

    function _voteNfts(
        uint256 proposalId,
        ShrinkableArray.UintArray memory nftIds,
        address voter
    ) private {
        ProposalCore storage core = _beforeVote(proposalId, voter);

        ShrinkableArray.UintArray memory _nftsToVote = ShrinkableArray.create(nftIds.length);
        uint256 length;

        for (uint256 i; i < nftIds.length; i++) {
            if (_voteInfos[proposalId][voter].nftsVoted.contains(nftIds.values[i])) {
                continue;
            }

            require(i == 0 || nftIds.values[i] > nftIds.values[i - 1], "GovV: wrong NFT order");

            _nftsToVote.values[length++] = nftIds.values[i];
        }

        _nftsToVote = govUserKeeper.lockNfts(voter, _nftsToVote.crop(length));

        uint256 voteAmount = govUserKeeper.getNftsPowerInTokens(
            _nftsToVote,
            core.nftPowerSnapshotId
        );

        require(voteAmount > 0, "GovV: vote amount is zero");

        for (uint256 i; i < _nftsToVote.length; i++) {
            _voteInfos[proposalId][voter].nftsVoted.add(_nftsToVote.values[i]);
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

        require(_votedInProposals[voter].length() < votesLimit, "GovV: vote limit reached");
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

    function _beforeUnlock(uint256 proposalId) private view {
        ProposalState state = _getProposalState(proposals[proposalId].core);

        require(
            state == ProposalState.Succeeded || state == ProposalState.Defeated,
            "GovV: invalid proposal status"
        );
    }
}
