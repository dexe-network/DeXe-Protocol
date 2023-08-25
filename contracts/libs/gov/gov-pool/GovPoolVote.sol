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

    event VoteChanged(uint256 proposalId, address voter, bool isVoteFor, IGovPool.Votes votes);

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

        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        if (amount != 0 || nftIds.length != 0) {
            (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
            IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

            if (amount != 0) {
                userKeeper.lockTokens(proposalId, msg.sender, amount);
            }

            if (nftIds.length != 0) {
                userKeeper.lockNfts(msg.sender, voteType, nftIds);
            }

            _vote(core, votePowers[IGovPool.VoteType.PersonalVote], amount, nftIds);
        }

        if (voteType != IGovPool.VoteType.DelegatedVote) {
            _voteDelegated(
                core,
                votePowers[IGovPool.VoteType.MicropoolVote],
                msg.sender,
                IGovPool.VoteType.MicropoolVote
            );
            _voteDelegated(
                core,
                votePowers[IGovPool.VoteType.TreasuryVote],
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
            IGovPool.VotePower storage votePower = voteInfo.votePowers[voteType];

            if (core.settings.delegatedVotingAllowed) {
                continue;
            }

            _cancel(votePower);
            _voteDelegated(core, votePower, voter, voteType);

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

        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        IGovPool.VotePower storage personalPower = votePowers[IGovPool.VoteType.PersonalVote];

        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        if (personalPower.tokensVoted != 0) {
            userKeeper.unlockTokens(proposalId, msg.sender, personalPower.tokensVoted);
        }

        if (personalPower.nftsVoted.length() != 0) {
            userKeeper.unlockNfts(personalPower.nftsVoted.values());
        }

        _cancel(votePowers[IGovPool.VoteType.PersonalVote]);

        if (!core.settings.delegatedVotingAllowed) {
            _cancel(votePowers[IGovPool.VoteType.MicropoolVote]);
            _cancel(votePowers[IGovPool.VoteType.TreasuryVote]);
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
        (IGovPool.Votes memory votes, uint256 totalPowerVoted) = _getVotes(voteInfo);

        uint256 typedVotes;
        if (voteType == IGovPool.VoteType.PersonalVote) {
            typedVotes = votes.personal;
        } else if (voteType == IGovPool.VoteType.MicropoolVote) {
            typedVotes = votes.micropool;
        } else {
            typedVotes = votes.treasury;
        }

        return totalPowerVoted != 0 ? voteInfo.totalVoted.ratio(typedVotes, totalPowerVoted) : 0;
    }

    function _voteDelegated(
        IGovPool.ProposalCore storage core,
        IGovPool.VotePower storage votePower,
        address voter,
        IGovPool.VoteType voteType
    ) internal {
        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        (uint256 amount, ) = userKeeper.tokenBalance(voter, voteType);
        (uint256[] memory nftIds, ) = userKeeper.nftExactBalance(voter, voteType);

        _vote(core, votePower, amount, nftIds);
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        IGovPool.VotePower storage votePower,
        uint256 amount,
        uint256[] memory nftIds
    ) internal {
        votePower.tokensVoted = amount;

        if (nftIds.length == 0) {
            votePower.powerVoted = amount;
            return;
        }

        EnumerableSet.UintSet storage nftsVoted = votePower.nftsVoted;

        for (uint256 i; i < nftIds.length; i++) {
            require(nftsVoted.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        votePower.powerVoted =
            amount +
            IGovUserKeeper(userKeeper).getNftsPowerInTokensBySnapshot(
                nftIds,
                core.nftPowerSnapshotId
            );
    }

    function _cancel(IGovPool.VotePower storage votePower) internal {
        votePower.tokensVoted = 0;
        votePower.powerVoted = 0;

        EnumerableSet.UintSet storage nftsVoted = votePower.nftsVoted;

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

        (IGovPool.Votes memory votes, ) = _getVotes(voteInfo);

        emit VoteChanged(proposalId, voter, isVoteFor, votes);
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

        (, uint256 totalPowerVoted) = _getVotes(voteInfo);
        uint256 votePower = _calculateVotes(voter, totalPowerVoted);

        if (isVoteFor) {
            core.votesPowerFor += totalPowerVoted;
            core.votesFor += votePower;
        } else {
            core.votesPowerAgainst += totalPowerVoted;
            core.votesAgainst += votePower;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        voteInfo.isVoteFor = isVoteFor;
        voteInfo.totalVoted = votePower;
    }

    function _globalCancel(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        bool isVoteFor
    ) internal {
        require(activeVotes.remove(proposalId), "Gov: not active");

        (, uint256 totalPowerVoted) = _getVotes(voteInfo);

        if (isVoteFor) {
            core.votesPowerFor -= totalPowerVoted;
            core.votesFor -= voteInfo.totalVoted;
        } else {
            core.votesPowerAgainst -= totalPowerVoted;
            core.votesAgainst -= voteInfo.totalVoted;
        }

        voteInfo.isVoteFor = false;
        voteInfo.totalVoted = 0;
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

    function _getVotes(
        IGovPool.VoteInfo storage voteInfo
    ) internal view returns (IGovPool.Votes memory votes, uint256 totalPowerVoted) {
        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        votes = IGovPool.Votes({
            personal: votePowers[IGovPool.VoteType.PersonalVote].powerVoted,
            micropool: votePowers[IGovPool.VoteType.MicropoolVote].powerVoted,
            treasury: votePowers[IGovPool.VoteType.TreasuryVote].powerVoted
        });

        totalPowerVoted = votes.personal + votes.micropool + votes.treasury;
    }

    function _isVoted(IGovPool.VoteInfo storage voteInfo) internal view returns (bool) {
        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        IGovPool.VotePower storage personalPower = votePowers[IGovPool.VoteType.PersonalVote];
        IGovPool.VotePower storage micropoolPower = votePowers[IGovPool.VoteType.MicropoolVote];
        IGovPool.VotePower storage treasuryPower = votePowers[IGovPool.VoteType.TreasuryVote];

        /// @dev nft power can be zero
        return
            personalPower.powerVoted != 0 ||
            micropoolPower.powerVoted != 0 ||
            treasuryPower.powerVoted != 0 ||
            personalPower.nftsVoted.length() != 0 ||
            micropoolPower.nftsVoted.length() != 0 ||
            treasuryPower.nftsVoted.length() != 0;
    }

    function _checkMinVotesForVoting(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo
    ) internal view {
        (, uint256 totalPowerVoted) = _getVotes(voteInfo);

        require(totalPowerVoted >= core.settings.minVotesForVoting, "Gov: low voting power");
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
