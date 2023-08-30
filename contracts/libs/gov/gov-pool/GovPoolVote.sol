// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/voting/IVotePower.sol";

import "../../math/MathHelper.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using Math for uint256;
    using MathHelper for uint256;

    event VoteChanged(uint256 proposalId, address voter, bool isVoteFor, uint256 totalVoted);

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => EnumerableSet.UintSet) storage votedInProposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        uint256 amount,
        uint256[] calldata nftIds,
        bool isVoteFor
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender];

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.DelegatedVote
            : IGovPool.VoteType.PersonalVote;

        _canVote(voteInfo, restrictedProposals[msg.sender], proposalId, amount, voteType);

        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        if (amount != 0 || nftIds.length != 0) {
            (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
            IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

            if (amount != 0) {
                userKeeper.lockTokens(proposalId, msg.sender, amount);
            }

            if (nftIds.length != 0) {
                userKeeper.lockNfts(msg.sender, voteType, nftIds);
            }

            _vote(core, rawVotes[IGovPool.VoteType.PersonalVote], amount, nftIds);
        }

        if (voteType != IGovPool.VoteType.DelegatedVote) {
            _voteDelegated(
                core,
                rawVotes[IGovPool.VoteType.MicropoolVote],
                msg.sender,
                IGovPool.VoteType.MicropoolVote
            );
            _voteDelegated(
                core,
                rawVotes[IGovPool.VoteType.TreasuryVote],
                msg.sender,
                IGovPool.VoteType.TreasuryVote
            );
        }

        _checkMinVotesForVoting(core, voteInfo);

        _updateGlobalState(
            core,
            voteInfo,
            votedInProposals[msg.sender],
            proposalId,
            msg.sender,
            isVoteFor
        );
    }

    function revoteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage votedInProposals,
        address voter,
        IGovPool.VoteType voteType
    ) external {
        EnumerableSet.UintSet storage activeProposals = votedInProposals[voter];

        uint256[] memory proposalIds = activeProposals.values();

        for (uint256 i = 0; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            IGovPool.ProposalCore storage core = proposals[proposalId].core;
            IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][voter];
            IGovPool.RawVote storage rawVote = voteInfo.rawVotes[voteType];

            if (core.settings.delegatedVotingAllowed) {
                continue;
            }

            _cancel(rawVote);
            _voteDelegated(core, rawVote, voter, voteType);

            _updateGlobalState(
                core,
                voteInfo,
                activeProposals,
                proposalId,
                voter,
                voteInfo.isVoteFor
            );
        }
    }

    function cancelVote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => EnumerableSet.UintSet) storage votedInProposals,
        mapping(uint256 => mapping(address => IGovPool.VoteInfo)) storage voteInfos,
        uint256 proposalId
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender];

        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        IGovPool.RawVote storage personalRawVote = rawVotes[IGovPool.VoteType.PersonalVote];

        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        if (personalRawVote.tokensVoted != 0) {
            userKeeper.unlockTokens(proposalId, msg.sender, personalRawVote.tokensVoted);
        }

        if (personalRawVote.nftsVoted.length() != 0) {
            userKeeper.unlockNfts(personalRawVote.nftsVoted.values());
        }

        _cancel(rawVotes[IGovPool.VoteType.PersonalVote]);

        if (!core.settings.delegatedVotingAllowed) {
            _cancel(rawVotes[IGovPool.VoteType.MicropoolVote]);
            _cancel(rawVotes[IGovPool.VoteType.TreasuryVote]);
        }

        _updateGlobalState(
            core,
            voteInfo,
            votedInProposals[msg.sender],
            proposalId,
            msg.sender,
            voteInfo.isVoteFor
        );
    }

    function getVoteShare(
        IGovPool.VoteInfo storage voteInfo,
        IGovPool.VoteType voteType
    ) external view returns (uint256) {
        uint256 totalRawVoted = voteInfo.totalRawVoted;

        if (totalRawVoted == 0) {
            return 0;
        }

        return voteInfo.totalVoted.ratio(voteInfo.rawVotes[voteType].totalVoted, totalRawVoted);
    }

    function _voteDelegated(
        IGovPool.ProposalCore storage core,
        IGovPool.RawVote storage rawVote,
        address voter,
        IGovPool.VoteType voteType
    ) internal {
        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        (uint256 amount, ) = userKeeper.tokenBalance(voter, voteType);
        (uint256[] memory nftIds, ) = userKeeper.nftExactBalance(voter, voteType);

        _vote(core, rawVote, amount, nftIds);
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        IGovPool.RawVote storage rawVote,
        uint256 amount,
        uint256[] memory nftIds
    ) internal {
        rawVote.tokensVoted = amount;

        if (nftIds.length == 0) {
            rawVote.totalVoted = amount;
            return;
        }

        EnumerableSet.UintSet storage nftsVoted = rawVote.nftsVoted;

        for (uint256 i; i < nftIds.length; i++) {
            require(nftsVoted.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        rawVote.totalVoted =
            amount +
            IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
                nftIds,
                core.nftPowerSnapshotId
            );
    }

    function _cancel(IGovPool.RawVote storage rawVote) internal {
        rawVote.tokensVoted = 0;
        rawVote.totalVoted = 0;

        EnumerableSet.UintSet storage nftsVoted = rawVote.nftsVoted;

        while (nftsVoted.length() > 0) {
            nftsVoted.remove(nftsVoted.at(0));
        }
    }

    function _updateGlobalState(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        address voter,
        bool isVoteFor
    ) internal {
        if (_isVoted(voteInfo)) {
            _globalVote(core, voteInfo, activeVotes, proposalId, voter, isVoteFor);
        } else {
            _globalCancel(core, voteInfo, activeVotes, proposalId, isVoteFor);
        }

        emit VoteChanged(proposalId, voter, isVoteFor, voteInfo.totalVoted);
    }

    function _globalVote(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        address voter,
        bool isVoteFor
    ) internal {
        activeVotes.add(proposalId);

        require(
            activeVotes.length() <= IGovPool(address(this)).coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        uint256 totalRawVoted = rawVotes[IGovPool.VoteType.PersonalVote].totalVoted +
            rawVotes[IGovPool.VoteType.MicropoolVote].totalVoted +
            rawVotes[IGovPool.VoteType.TreasuryVote].totalVoted;
        uint256 totalVoted = _calculateVotes(voter, totalRawVoted);

        if (isVoteFor) {
            core.rawVotesFor += totalRawVoted;
            core.votesFor += totalVoted;
        } else {
            core.rawVotesAgainst += totalRawVoted;
            core.votesAgainst += totalVoted;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        voteInfo.isVoteFor = isVoteFor;
        voteInfo.totalVoted = totalVoted;
        voteInfo.totalRawVoted = totalRawVoted;
    }

    function _globalCancel(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        bool isVoteFor
    ) internal {
        require(activeVotes.remove(proposalId), "Gov: not active");

        if (isVoteFor) {
            core.rawVotesFor -= voteInfo.totalRawVoted;
            core.votesFor -= voteInfo.totalVoted;
        } else {
            core.rawVotesAgainst -= voteInfo.totalRawVoted;
            core.votesAgainst -= voteInfo.totalVoted;
        }

        voteInfo.isVoteFor = false;
        voteInfo.totalVoted = 0;
        voteInfo.totalRawVoted = 0;
    }

    function _canVote(
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage restrictedUserProposals,
        uint256 proposalId,
        uint256 amount,
        IGovPool.VoteType voteType
    ) internal view {
        IGovPool govPool = IGovPool(address(this));

        (, address userKeeper, , , ) = govPool.getHelperContracts();
        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            msg.sender,
            voteType
        );

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            !restrictedUserProposals.contains(proposalId),
            "Gov: user restricted from voting in this proposal"
        );
        require(!_isVoted(voteInfo), "Gov: need cancel");
        require(amount <= tokenBalance - ownedBalance, "Gov: wrong vote amount");
    }

    function _isVoted(IGovPool.VoteInfo storage voteInfo) internal view returns (bool) {
        mapping(IGovPool.VoteType => IGovPool.RawVote) storage rawVotes = voteInfo.rawVotes;

        IGovPool.RawVote storage personalRawVote = rawVotes[IGovPool.VoteType.PersonalVote];
        IGovPool.RawVote storage micropoolRawVote = rawVotes[IGovPool.VoteType.MicropoolVote];
        IGovPool.RawVote storage treasuryRawVote = rawVotes[IGovPool.VoteType.TreasuryVote];

        /// @dev nft power can be zero
        return
            personalRawVote.totalVoted != 0 ||
            micropoolRawVote.totalVoted != 0 ||
            treasuryRawVote.totalVoted != 0 ||
            personalRawVote.nftsVoted.length() != 0 ||
            micropoolRawVote.nftsVoted.length() != 0 ||
            treasuryRawVote.nftsVoted.length() != 0;
    }

    function _checkMinVotesForVoting(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo
    ) internal view {
        require(
            voteInfo.totalRawVoted >= core.settings.minVotesForVoting,
            "Gov: low voting power"
        );
    }

    function _quorumReached(IGovPool.ProposalCore storage core) internal view returns (bool) {
        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();

        return
            PERCENTAGE_100.ratio(
                core.votesFor + core.votesAgainst,
                IGovUserKeeper(userKeeperAddress).getTotalVoteWeight()
            ) >= core.settings.quorum;
    }

    function _calculateVotes(address voter, uint256 voteAmount) internal view returns (uint256) {
        (, , , , address votePowerAddress) = IGovPool(address(this)).getHelperContracts();
        IVotePower votePower = IVotePower(votePowerAddress);

        return votePower.transformVotes(voter, voteAmount);
    }
}
