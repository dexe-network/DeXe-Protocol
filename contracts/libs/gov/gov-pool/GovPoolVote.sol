// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../gov/GovPool.sol";

import "../../math/MathHelper.sol";
import "../../math/LogExpMath.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using Math for uint256;
    using MathHelper for uint256;
    using LogExpMath for uint256;
    using DecimalsConverter for uint256;

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
    ) external returns (IGovPool.Votes memory) {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender];

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.DelegatedVote
            : IGovPool.VoteType.PersonalVote;

        _canVote(voteInfo, restrictedProposals[msg.sender], proposalId, amount, voteType);

        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        if (amount != 0 || nftIds.length != 0) {
            (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
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
                votePowers[IGovPool.VoteType.MicropoolVote],
                msg.sender,
                IGovPool.VoteType.TreasuryVote
            );
        }

        return
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
        uint256 proposalId,
        address voter,
        IGovPool.VoteType voteType
    ) external returns (IGovPool.Votes memory votes) {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][voter];
        IGovPool.VotePower storage votePower = voteInfo.votePowers[voteType];

        if (core.settings.delegatedVotingAllowed) {
            return votes;
        }

        _cancel(votePower);
        _voteDelegated(core, votePower, voter, voteType);

        return
            _updateGlobalState(
                core,
                voteInfo,
                votedInProposals[voter],
                proposalId,
                voter,
                voteInfo.isVoteFor
            );
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

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
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

    function getVotes(
        IGovPool.VoteInfo storage voteInfo
    ) public view returns (IGovPool.Votes memory votes, bool isVoted) {
        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        IGovPool.VotePower storage personalPower = votePowers[IGovPool.VoteType.PersonalVote];
        IGovPool.VotePower storage micropoolPower = votePowers[IGovPool.VoteType.MicropoolVote];
        IGovPool.VotePower storage treasuryPower = votePowers[IGovPool.VoteType.TreasuryVote];

        votes.personal = personalPower.powerVoted;
        votes.micropool = micropoolPower.powerVoted;
        votes.treasury = treasuryPower.powerVoted;

        /// @dev nft power can be zero
        return (
            votes,
            votes.personal != 0 ||
                votes.micropool != 0 ||
                votes.treasury != 0 ||
                personalPower.nftsVoted.length() != 0 ||
                micropoolPower.nftsVoted.length() != 0 ||
                treasuryPower.nftsVoted.length() != 0
        );
    }

    function _voteDelegated(
        IGovPool.ProposalCore storage core,
        IGovPool.VotePower storage votePower,
        address voter,
        IGovPool.VoteType voteType
    ) internal {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
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
            nftsVoted.add(nftIds[i]);
        }

        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

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
    ) internal returns (IGovPool.Votes memory votes) {
        bool isVoted;
        (votes, isVoted) = getVotes(voteInfo);

        if (isVoted) {
            votes = _globalVote(core, voteInfo, activeVotes, proposalId, voter, isVoteFor, votes);
        } else {
            _globalCancel(core, voteInfo, activeVotes, proposalId, isVoteFor);
        }

        emit VoteChanged(proposalId, voter, isVoteFor, votes);
    }

    function _globalVote(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        address voter,
        bool isVoteFor,
        IGovPool.Votes memory votes
    ) internal returns (IGovPool.Votes memory) {
        activeVotes.add(proposalId);

        require(
            activeVotes.length() <= IGovPool(address(this)).coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        uint256 totalVoted = votes.personal + votes.micropool + votes.treasury;
        uint256 votePower = _calculateVotes(voter, totalVoted);

        if (isVoteFor) {
            core.votesFor += votePower;
        } else {
            core.votesAgainst += votePower;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        voteInfo.isVoteFor = isVoteFor;
        voteInfo.totalVoted = votePower;

        votes.personal = votes.personal.ratio(votePower, totalVoted);
        votes.micropool = votes.micropool.ratio(votePower, totalVoted);
        votes.treasury = votePower - votes.personal - votes.micropool;

        return votes;
    }

    function _globalCancel(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage activeVotes,
        uint256 proposalId,
        bool isVoteFor
    ) internal {
        activeVotes.remove(proposalId);

        if (isVoteFor) {
            core.votesFor -= voteInfo.totalVoted;
        } else {
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

        mapping(IGovPool.VoteType => IGovPool.VotePower) storage votePowers = voteInfo.votePowers;

        (, address userKeeper, , ) = govPool.getHelperContracts();
        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            msg.sender,
            voteType
        );

        (, bool isVoted) = getVotes(voteInfo);

        require(!isVoted, "Gov: need cancel");
        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            !restrictedUserProposals.contains(proposalId),
            "Gov: user restricted from voting in this proposal"
        );
        require(amount <= tokenBalance - ownedBalance, "Gov: wrong vote amount");
    }

    function _quorumReached(IGovPool.ProposalCore storage core) internal view returns (bool) {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        return
            PERCENTAGE_100.ratio(
                core.votesFor + core.votesAgainst,
                IGovUserKeeper(userKeeperAddress).getTotalVoteWeight()
            ) >= core.settings.quorum;
    }

    function _treasuryVoteCoefficient(address voter) internal view returns (uint256) {
        (, address userKeeperAddress, , ) = GovPool(payable(address(this))).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        (uint256 power, ) = userKeeper.tokenBalance(voter, IGovPool.VoteType.TreasuryVote);

        (uint256[] memory nfts, ) = userKeeper.nftExactBalance(
            voter,
            IGovPool.VoteType.TreasuryVote
        );
        (uint256 nftPower, ) = userKeeper.nftVotingPower(nfts);

        power += nftPower;

        return power.ratio(PRECISION, userKeeper.getTotalVoteWeight()) / 10;
    }

    function _calculateVotes(address voter, uint256 voteAmount) internal view returns (uint256) {
        uint256 coefficient = IGovPool(address(this)).getVoteModifierForUser(voter);

        if (IGovPool(address(this)).getExpertStatus(voter)) {
            uint256 treasuryVoteCoefficient = _treasuryVoteCoefficient(voter);

            // @dev Assuming treasury vote coefficient is always <= 1
            coefficient -= treasuryVoteCoefficient;
        }

        if (coefficient <= PRECISION) {
            return voteAmount;
        }

        return voteAmount.pow(coefficient.ratio(DECIMALS, PRECISION));
    }
}
