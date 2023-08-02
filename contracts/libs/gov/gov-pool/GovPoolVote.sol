// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../gov/GovPool.sol";

import "../../utils/DataHelper.sol";

import "../../math/MathHelper.sol";
import "../../math/LogExpMath.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using MathHelper for uint256;
    using LogExpMath for uint256;
    using DecimalsConverter for uint256;
    using DataHelper for bytes;

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
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][false];

        votes.add(proposalId);

        require(
            votes.length() <= GovPool(payable(address(this))).coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.PersonalVote
        ];

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.PersonalVote
            : IGovPool.VoteType.DelegatedVote;

        return _vote(core, voteInfo, proposalId, voteAmount, voteNftIds, voteType, isVoteFor);
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
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

        votes.add(proposalId);

        require(
            votes.length() <= GovPool(payable(address(this))).coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.MicropoolVote
        ];

        return
            _vote(
                core,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                IGovPool.VoteType.MicropoolVote,
                isVoteFor
            );
    }

    function voteTreasury(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        // TODO: do we need this?
        require(core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.TreasuryVote
        ];

        return
            _vote(
                core,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                IGovPool.VoteType.TreasuryVote,
                isVoteFor
            );
    }

    function _treasuryVoteCoefficient() internal pure returns (uint256) {
        return 1;
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
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal returns (uint256) {
        _canVote(core, proposalId, voteType);

        IGovPool govPool = IGovPool(address(this));

        (, address userKeeperAddress, , ) = govPool.getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        if (voteAmount > 0) {
            if (voteType != IGovPool.VoteType.TreasuryVote) {
                userKeeper.lockTokens(proposalId, msg.sender, voteType, voteAmount);
            }

            _voteTokens(voteInfo, voteAmount, voteType, isVoteFor);
        }

        if (voteNftIds.length > 0) {
            if (voteType != IGovPool.VoteType.TreasuryVote) {
                userKeeper.lockNfts(msg.sender, voteType, voteNftIds);
            }

            voteAmount += _voteNfts(core, voteInfo, voteNftIds, isVoteFor);
        }

        uint256 rootPower = govPool.getVoteModifierForUser(msg.sender);
        voteAmount = _calculateVotes(voteAmount, rootPower, 1);

        if (isVoteFor) {
            core.votesFor += voteAmount;
            voteInfo.totalVotedFor += voteAmount;
        } else {
            core.votesAgainst += voteAmount;
            voteInfo.totalVotedAgainst += voteAmount;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        // TODO: fix event due to treasury vote
        emit Voted(
            proposalId,
            msg.sender,
            voteType == IGovPool.VoteType.MicropoolVote ? 0 : voteAmount,
            voteType == IGovPool.VoteType.MicropoolVote ? voteAmount : 0,
            isVoteFor
        );

        return voteAmount;
    }

    function _canVote(
        IGovPool.ProposalCore storage core,
        uint256 proposalId,
        IGovPool.VoteType voteType
    ) internal view {
        IGovPool govPool = IGovPool(address(this));

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );

        (, address userKeeper, , ) = govPool.getHelperContracts();

        require(
            IGovUserKeeper(userKeeper).canVote(
                msg.sender,
                voteType,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );
    }

    function _voteTokens(
        IGovPool.VoteInfo storage voteInfo,
        uint256 amount,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            msg.sender,
            voteType
        );

        require(
            amount <=
                tokenBalance -
                    ownedBalance -
                    voteInfo.tokensVotedFor -
                    voteInfo.tokensVotedAgainst,
            "Gov: wrong vote amount"
        );

        if (isVoteFor) {
            voteInfo.tokensVotedFor += amount;
        } else {
            voteInfo.tokensVotedAgainst += amount;
        }
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] calldata nftIds,
        bool isVoteFor
    ) internal returns (uint256 voteAmount) {
        EnumerableSet.UintSet storage votedNfts = _votedNfts(voteInfo, isVoteFor);

        for (uint256 i; i < nftIds.length; i++) {
            require(votedNfts.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);
    }

    function _votedNfts(
        IGovPool.VoteInfo storage voteInfo,
        bool isVoteFor
    ) internal view returns (EnumerableSet.UintSet storage) {
        return isVoteFor ? voteInfo.nftsVotedFor : voteInfo.nftsVotedAgainst;
    }

    function _calculateVotes(
        uint256 tokenAmount,
        uint256 rootPower,
        uint256 coefficient
    ) private pure returns (uint256) {
        return tokenAmount.pow(rootPower) / coefficient;
    }
}
