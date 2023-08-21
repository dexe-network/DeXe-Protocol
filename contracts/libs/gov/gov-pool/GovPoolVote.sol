// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../gov/GovPool.sol";

import "../../math/MathHelper.sol";
import "../../math/LogExpMath.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using MathHelper for uint256;
    using LogExpMath for uint256;
    using DecimalsConverter for uint256;

    event Voted(
        uint256 proposalId,
        address sender,
        IGovPool.VoteType voteType,
        uint256 amount,
        bool isVoteFor
    );

    event VotesCanceled(
        uint256 proposalId,
        address sender,
        IGovPool.VoteType voteType,
        uint256 amount,
        bool isVoteFor
    );

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        address voter,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.DelegatedVote
            : IGovPool.VoteType.PersonalVote;

        return
            _vote(
                core,
                votedInProposals[voter][IGovPool.VoteType.PersonalVote],
                voteInfos[proposalId][voter][IGovPool.VoteType.PersonalVote],
                restrictedProposals[voter],
                proposalId,
                voter,
                voteAmount,
                voteNftIds,
                voteType,
                isVoteFor
            );
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        address voter,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) external returns (uint256) {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 voteAmount, ) = IGovUserKeeper(userKeeper).tokenBalance(voter, voteType);
        (uint256[] memory voteNftIds, ) = IGovUserKeeper(userKeeper).nftExactBalance(
            voter,
            voteType
        );

        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(!core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        return
            _vote(
                core,
                votedInProposals[voter][voteType],
                voteInfos[proposalId][voter][voteType],
                restrictedProposals[voter],
                proposalId,
                voter,
                voteAmount,
                voteNftIds,
                voteType,
                isVoteFor
            );
    }

    function cancelVote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        address voter,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256 totalVotedBefore, uint256 totalVotedAfter) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty cancel");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.DelegatedVote
            : IGovPool.VoteType.PersonalVote;

        return
            _cancel(
                core,
                votedInProposals[voter][voteType],
                voteInfos[proposalId][voter][voteType],
                proposalId,
                voter,
                voteAmount,
                voteNftIds,
                voteType,
                isVoteFor
            );
    }

    function cancelVoteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        address voter,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) external returns (uint256 totalVotedBefore, uint256 totalVotedAfter) {
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][voter][voteType];

        uint256 voteAmount = voteInfo.tokensVoted;
        uint256[] memory voteNftIds = voteInfo.nftsVoted.values();

        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated cancel");

        return
            _cancel(
                proposals[proposalId].core,
                votedInProposals[voter][voteType],
                voteInfo,
                proposalId,
                voter,
                voteAmount,
                voteNftIds,
                voteType,
                isVoteFor
            );
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage restrictedUserProposals,
        uint256 proposalId,
        address voter,
        uint256 voteAmount,
        uint256[] memory voteNftIds,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal returns (uint256) {
        GovPool govPool = GovPool(payable(address(this)));
        (, address userKeeperAddress, , ) = govPool.getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        _canVote(core, voteInfo, restrictedUserProposals, proposalId, voter, voteType, isVoteFor);

        votes.add(proposalId);

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        if (voteInfo.totalVoted == 0) {
            voteInfo.isVoteFor = isVoteFor;
        }

        bool lockNeeded = voteType != IGovPool.VoteType.MicropoolVote &&
            voteType != IGovPool.VoteType.TreasuryVote;

        if (voteAmount > 0) {
            if (lockNeeded) {
                userKeeper.lockTokens(proposalId, voter, voteAmount);
            }

            _voteTokens(voteInfo, voter, voteAmount, voteType);
        }

        if (voteNftIds.length > 0) {
            if (lockNeeded) {
                userKeeper.lockNfts(voter, voteType, voteNftIds);
            }

            voteAmount += _voteNfts(core, voteInfo, voteNftIds);
        }

        voteAmount = _calculateVotes(voter, voteAmount, voteType);

        voteInfo.totalVoted += voteAmount;

        if (isVoteFor) {
            core.votesFor += voteAmount;
        } else {
            core.votesAgainst += voteAmount;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        emit Voted(proposalId, voter, voteType, voteAmount, isVoteFor);

        return voteAmount;
    }

    function _cancel(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        address voter,
        uint256 voteAmount,
        uint256[] memory voteNftIds,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal returns (uint256 totalVotedBefore, uint256 totalVotedAfter) {
        require(isVoteFor == voteInfo.isVoteFor, "Gov: wrong is vote for");

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        totalVotedBefore = voteInfo.tokensVoted + voteInfo.nftPowerVoted;
        totalVotedAfter = voteAmount;

        bool unlockNeeded = voteType != IGovPool.VoteType.MicropoolVote &&
            voteType != IGovPool.VoteType.TreasuryVote;

        if (voteAmount > 0) {
            if (unlockNeeded) {
                userKeeper.unlockTokens(proposalId, voter, voteAmount);
            }

            _cancelTokens(voteInfo, voteAmount);
        }

        if (voteNftIds.length > 0) {
            if (unlockNeeded) {
                userKeeper.unlockNfts(voteNftIds);
            }

            totalVotedAfter += _cancelNfts(core, voteInfo, voteNftIds);
        }

        uint256 cancelAmount = voteInfo.totalVoted -
            voteInfo.totalVoted.ratio(totalVotedAfter, totalVotedBefore);

        voteInfo.totalVoted -= cancelAmount;

        if (isVoteFor) {
            core.votesFor -= cancelAmount;
        } else {
            core.votesAgainst -= cancelAmount;
        }

        if (voteInfo.totalVoted == 0) {
            votes.remove(proposalId);
        }

        emit VotesCanceled(proposalId, voter, voteType, cancelAmount, isVoteFor);
    }

    function _voteTokens(
        IGovPool.VoteInfo storage voteInfo,
        address voter,
        uint256 amount,
        IGovPool.VoteType voteType
    ) internal {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            voter,
            voteType
        );

        require(
            tokenBalance >= amount + ownedBalance + voteInfo.tokensVoted,
            "Gov: wrong vote amount"
        );

        voteInfo.tokensVoted += amount;
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] memory nftIds
    ) internal returns (uint256 voteAmount) {
        EnumerableSet.UintSet storage nftsVoted = voteInfo.nftsVoted;

        for (uint256 i; i < nftIds.length; i++) {
            require(nftsVoted.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);

        voteInfo.nftPowerVoted = voteAmount;
    }

    function _cancelTokens(IGovPool.VoteInfo storage voteInfo, uint256 amount) internal {
        require(voteInfo.tokensVoted >= amount, "Gov: not enough tokens");

        voteInfo.tokensVoted -= amount;
    }

    function _cancelNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] memory nftIds
    ) internal returns (uint256 voteAmount) {
        EnumerableSet.UintSet storage nftsVoted = voteInfo.nftsVoted;

        for (uint256 i; i < nftIds.length; i++) {
            require(nftsVoted.remove(nftIds[i]), "Gov: NFT didn't vote");
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);

        voteInfo.nftPowerVoted = voteAmount;
    }

    function _canVote(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage restrictedUserProposals,
        uint256 proposalId,
        address voter,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal view {
        IGovPool govPool = IGovPool(address(this));
        (, address userKeeper, , ) = govPool.getHelperContracts();

        require(voteInfo.isVoteFor == isVoteFor || voteInfo.totalVoted == 0, "Gov: dual vote");
        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            !restrictedUserProposals.contains(proposalId),
            "Gov: user restricted from voting in this proposal"
        );
        require(
            IGovUserKeeper(userKeeper).canVote(
                voter,
                voteType,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
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

    function _calculateVotes(
        address voter,
        uint256 voteAmount,
        IGovPool.VoteType voteType
    ) internal view returns (uint256) {
        uint256 coefficient = IGovPool(address(this)).getVoteModifierForUser(voter);

        if (voteType == IGovPool.VoteType.TreasuryVote) {
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
